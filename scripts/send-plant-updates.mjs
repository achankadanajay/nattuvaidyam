import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import webpush from "web-push";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_APP_ORIGIN = "https://nattuvaidyam.in";
const DEFAULT_CONTACT = "mailto:ajyghosh@gmail.com";

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBooleanEnv(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function parseServiceAccount() {
  const raw = readRequiredEnv("FIREBASE_SERVICE_ACCOUNT");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function getLocalizedText(value, language) {
  const text = value?.[language];
  return typeof text === "string" ? text.trim() : "";
}

function getPlantName(plant, language) {
  return (
    getLocalizedText(plant.common_name, language) ||
    plant.scientific_name ||
    plant.id
  );
}

function getPlantSummary(plant, language) {
  return (
    getLocalizedText(plant.overview, language) ||
    getLocalizedText(plant.medicinal_properties, language) ||
    getLocalizedText(plant.plant_characteristics, language) ||
    plant.scientific_name ||
    ""
  );
}

function truncateText(value, maxLength = 140) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");

  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function getNotificationOrder(plant) {
  return Number.isFinite(plant.notificationOrder) ? plant.notificationOrder : null;
}

function sortPlants(left, right) {
  const leftOrder = getNotificationOrder(left);
  const rightOrder = getNotificationOrder(right);

  if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  if (leftOrder !== null && rightOrder === null) {
    return -1;
  }

  if (leftOrder === null && rightOrder !== null) {
    return 1;
  }

  if (left.createdAtMs !== right.createdAtMs) {
    return left.createdAtMs - right.createdAtMs;
  }

  const leftName = getPlantName(left, "en");
  const rightName = getPlantName(right, "en");
  const nameCompare = leftName.localeCompare(rightName);

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.id.localeCompare(right.id);
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
      typeof subscription.endpoint === "string" &&
      subscription.endpoint &&
      typeof subscription.keys?.p256dh === "string" &&
      typeof subscription.keys?.auth === "string",
  );
}

function normalizeLanguage(value) {
  return value === "ml" ? "ml" : "en";
}

function getTimestampMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return 0;
}

function buildNotificationPayload({ plant, language, appOrigin }) {
  const title = getPlantName(plant, language);
  const summary = truncateText(getPlantSummary(plant, language), 140);
  const iconUrl = new URL(
    "/favicon/web-app-manifest-192x192.png?v=20260802a",
    appOrigin,
  ).toString();
  const plantUrl = new URL(`/plants/${encodeURIComponent(plant.id)}`, appOrigin).toString();
  const plantImage = typeof plant.image?.src === "string" ? plant.image.src.trim() : "";

  return {
    title,
    body: summary || plant.scientific_name || "Tap to open the plant details.",
    icon: iconUrl,
    badge: iconUrl,
    image: plantImage || undefined,
    url: plantUrl,
    plantId: plant.id,
    tag: `plant-update-${plant.id}`,
  };
}

function createSummaryTracker() {
  return {
    subscriptionsChecked: 0,
    dueUsers: 0,
    sent: 0,
    skippedNotDue: 0,
    skippedMissingPlant: 0,
    disabledInvalidSubscription: 0,
    failed: 0,
  };
}

async function main() {
  const serviceAccount = parseServiceAccount();
  const webPushPublicKey = readRequiredEnv("WEB_PUSH_PUBLIC_KEY");
  const webPushPrivateKey = readRequiredEnv("WEB_PUSH_PRIVATE_KEY");
  const appOrigin = process.env.PLANT_UPDATES_APP_ORIGIN?.trim() || DEFAULT_APP_ORIGIN;
  const contactEmail = process.env.WEB_PUSH_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT;
  const isDryRun = parseBooleanEnv("PLANT_UPDATES_DRY_RUN");

  initializeApp({
    credential: cert(serviceAccount),
  });

  webpush.setVapidDetails(contactEmail, webPushPublicKey, webPushPrivateKey);

  const db = getFirestore();
  const summary = createSummaryTracker();
  const now = Date.now();

  const [plantsSnapshot, usersSnapshot] = await Promise.all([
    db.collection("plants").get(),
    db.collection("users").where("plantUpdates.enabled", "==", true).get(),
  ]);

  const plants = plantsSnapshot.docs
    .map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
      createdAtMs: snapshot.createTime?.toMillis?.() ?? 0,
    }))
    .sort(sortPlants);

  if (!plants.length) {
    console.log("No plants found. Exiting without sending notifications.");
    return;
  }

  console.log(
    `Loaded ${plants.length} plants and ${usersSnapshot.size} subscribed users${isDryRun ? " (dry run)" : ""}.`,
  );

  for (const userSnapshot of usersSnapshot.docs) {
    summary.subscriptionsChecked += 1;

    const plantUpdates = userSnapshot.data()?.plantUpdates ?? {};
    const subscription = plantUpdates.subscription;

    if (!isValidSubscription(subscription)) {
      summary.disabledInvalidSubscription += 1;

      if (!isDryRun) {
        await userSnapshot.ref.set(
          {
            plantUpdates: {
              enabled: false,
              subscription: null,
              lastError: "Missing or invalid push subscription.",
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
      }

      continue;
    }

    const nextSendAtMs = getTimestampMillis(plantUpdates.nextSendAt);

    if (nextSendAtMs && nextSendAtMs > now) {
      summary.skippedNotDue += 1;
      continue;
    }

    summary.dueUsers += 1;

    const nextPlantOrder =
      Number.isFinite(plantUpdates.nextPlantOrder) && plantUpdates.nextPlantOrder > 0
        ? plantUpdates.nextPlantOrder
        : 1;
    const plant = plants[nextPlantOrder - 1];

    if (!plant) {
      summary.skippedMissingPlant += 1;
      console.log(
        `User ${userSnapshot.id} is due, but plant order ${nextPlantOrder} is not available yet.`,
      );
      continue;
    }

    const language = normalizeLanguage(plantUpdates.language);
    const payload = buildNotificationPayload({
      plant,
      language,
      appOrigin,
    });

    console.log(
      `Sending plant ${nextPlantOrder} (${plant.id}) to user ${userSnapshot.id} in ${language}.`,
    );

    if (isDryRun) {
      summary.sent += 1;
      continue;
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));

      await userSnapshot.ref.set(
        {
            plantUpdates: {
              lastSentPlantId: plant.id,
              lastSentAt: FieldValue.serverTimestamp(),
              nextPlantOrder: nextPlantOrder + 1,
              nextSendAt: Timestamp.fromMillis(now + THREE_DAYS_MS),
              lastError: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
      );

      summary.sent += 1;
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
      const message =
        error instanceof Error ? error.message : "Unknown web push error";

      if (statusCode === 404 || statusCode === 410) {
        summary.disabledInvalidSubscription += 1;

        await userSnapshot.ref.set(
          {
            plantUpdates: {
              enabled: false,
              subscription: null,
              lastError: `Push subscription expired: ${message}`,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );

        console.warn(
          `Disabled expired subscription for user ${userSnapshot.id}: ${message}`,
        );
        continue;
      }

      summary.failed += 1;

      await userSnapshot.ref.set(
        {
          plantUpdates: {
            lastError: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

      console.error(`Failed to send plant update to user ${userSnapshot.id}: ${message}`);
    }
  }

  console.log("Plant update summary:");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});

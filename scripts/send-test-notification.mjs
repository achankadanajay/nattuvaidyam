import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, deleteField, getFirestore } from "firebase-admin/firestore";
import webpush from "web-push";

const DEFAULT_APP_ORIGIN = "https://nattuvaidyam.in";
const DEFAULT_CONTACT = "mailto:ajyghosh@gmail.com";

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
      typeof subscription.endpoint === "string" &&
      subscription.endpoint &&
      typeof subscription.keys?.p256dh === "string" &&
      typeof subscription.keys?.auth === "string",
  );
}

function normalizePath(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "/me";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function getEndpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}

async function main() {
  const serviceAccount = parseServiceAccount();
  const webPushPublicKey = readRequiredEnv("WEB_PUSH_PUBLIC_KEY");
  const webPushPrivateKey = readRequiredEnv("WEB_PUSH_PRIVATE_KEY");
  const targetUserId = readRequiredEnv("TEST_NOTIFICATION_TARGET_UID");
  const title = process.env.TEST_NOTIFICATION_TITLE?.trim() || "Nattuvaidyam test";
  const body =
    process.env.TEST_NOTIFICATION_BODY?.trim() ||
    "This is a manual push test from GitHub Actions.";
  const appOrigin = process.env.PLANT_UPDATES_APP_ORIGIN?.trim() || DEFAULT_APP_ORIGIN;
  const contactEmail = process.env.WEB_PUSH_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT;
  const path = normalizePath(process.env.TEST_NOTIFICATION_PATH);

  initializeApp({
    credential: cert(serviceAccount),
  });

  webpush.setVapidDetails(contactEmail, webPushPublicKey, webPushPrivateKey);

  const db = getFirestore();
  const userRef = db.collection("users").doc(targetUserId);
  const userSnapshot = await userRef.get();

  if (!userSnapshot.exists) {
    throw new Error(`User document not found: users/${targetUserId}`);
  }

  const plantUpdates = userSnapshot.data()?.plantUpdates ?? {};
  const subscription = plantUpdates.subscription;

  if (!plantUpdates.enabled) {
    throw new Error(`plantUpdates.enabled is false for users/${targetUserId}`);
  }

  if (!isValidSubscription(subscription)) {
    throw new Error(`Invalid or missing push subscription for users/${targetUserId}`);
  }

  const payload = {
    title,
    body,
    icon: new URL("/favicon/web-app-manifest-192x192.png?v=20260802a", appOrigin).toString(),
    badge: new URL("/favicon/web-app-manifest-192x192.png?v=20260802a", appOrigin).toString(),
    url: new URL(path, appOrigin).toString(),
    tag: `manual-test-${Date.now()}`,
  };

  console.log(`Sending manual test notification to users/${targetUserId}`);
  console.log(`Endpoint host: ${getEndpointHost(subscription.endpoint)}`);
  console.log(`Target URL: ${payload.url}`);

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));

    await userRef.set(
      {
        plantUpdates: {
          lastTestSentAt: FieldValue.serverTimestamp(),
          lastError: deleteField(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    console.log("Manual test notification accepted by push service.");
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
    const bodyText =
      error && typeof error === "object" && "body" in error
        ? String(error.body)
        : "";
    const headers =
      error && typeof error === "object" && "headers" in error ? error.headers : undefined;
    const message = error instanceof Error ? error.message : "Unknown web push error";

    await userRef.set(
      {
        plantUpdates: {
          lastError: `Manual test failed: ${message}`,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    console.error(`Manual test failed with status ${statusCode || "unknown"}: ${message}`);

    if (bodyText) {
      console.error(`Response body: ${bodyText}`);
    }

    if (headers) {
      console.error(`Response headers: ${JSON.stringify(headers)}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});

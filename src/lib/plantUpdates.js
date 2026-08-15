import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const PLANT_UPDATES_CADENCE_DAYS = 3;
const DEFAULT_WEB_PUSH_PUBLIC_KEY =
  "BKIN_cqNrk80zYHsGGhHHFW78KR7t63Mzq-qIR79RrUkqvHqtHhXY8egm5Uy4vRrr0visSJq4fDLt8IymSTcnjM";
const WEB_PUSH_PUBLIC_KEY =
  import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() || DEFAULT_WEB_PUSH_PUBLIC_KEY;

function getUserDoc(userId) {
  return doc(db, "users", userId);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function getNotificationPermission() {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

function getPlatformName() {
  if (typeof navigator === "undefined") {
    return "web";
  }

  const userAgent = navigator.userAgent || "";

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "ios";
  }

  if (/android/i.test(userAgent)) {
    return "android";
  }

  return "web";
}

async function ensureServiceWorkerRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service worker support is unavailable.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  await navigator.serviceWorker.ready;
  return registration;
}

function normalizePlantUpdatesPreference(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    enabled: value.enabled === true,
    permission: typeof value.permission === "string" ? value.permission : "default",
    cadenceDays:
      typeof value.cadenceDays === "number" && Number.isFinite(value.cadenceDays)
        ? value.cadenceDays
        : PLANT_UPDATES_CADENCE_DAYS,
    language: typeof value.language === "string" ? value.language : "en",
    platform: typeof value.platform === "string" ? value.platform : "web",
    nextPlantOrder:
      typeof value.nextPlantOrder === "number" && Number.isFinite(value.nextPlantOrder)
        ? value.nextPlantOrder
        : 1,
    nextSendAt: value.nextSendAt ?? null,
    subscribedAt: value.subscribedAt ?? null,
    updatedAt: value.updatedAt ?? null,
  };
}

export function getPlantUpdatesCapability({ isStandaloneMode, installPlatform }) {
  const supportsNotifications = typeof window !== "undefined" && "Notification" in window;
  const supportsServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const supportsPush = typeof window !== "undefined" && "PushManager" in window;
  const isConfigured = Boolean(WEB_PUSH_PUBLIC_KEY);
  const requiresInstall = !isStandaloneMode;

  if (!supportsNotifications || !supportsServiceWorker || !supportsPush) {
    return {
      state: "unsupported",
      installPlatform,
      isConfigured,
      permission: getNotificationPermission(),
    };
  }

  if (requiresInstall) {
    return {
      state: "install-required",
      installPlatform,
      isConfigured,
      permission: getNotificationPermission(),
    };
  }

  if (!isConfigured) {
    return {
      state: "not-configured",
      installPlatform,
      isConfigured,
      permission: getNotificationPermission(),
    };
  }

  return {
    state: "ready",
    installPlatform,
    isConfigured,
    permission: getNotificationPermission(),
  };
}

export function watchPlantUpdatesPreference(userId, onChange, onError) {
  return onSnapshot(
    getUserDoc(userId),
    (snapshot) => {
      onChange(normalizePlantUpdatesPreference(snapshot.data()?.plantUpdates ?? null));
    },
    onError,
  );
}

export async function enablePlantUpdates({ userId, language }) {
  if (!WEB_PUSH_PUBLIC_KEY) {
    throw new Error("Plant updates are not configured yet.");
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    await setDoc(
      getUserDoc(userId),
      {
        plantUpdates: {
          enabled: false,
          permission,
          language,
          platform: getPlatformName(),
          updatedAt: serverTimestamp(),
        },
      },
      { merge: true },
    );

    return { enabled: false, permission };
  }

  const registration = await ensureServiceWorkerRegistration();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    }));

  const userSnapshot = await getDoc(getUserDoc(userId));
  const existingPreference = userSnapshot.data()?.plantUpdates ?? null;

  await setDoc(
    getUserDoc(userId),
    {
      plantUpdates: {
        enabled: true,
        permission,
        language,
        platform: getPlatformName(),
        cadenceDays:
          typeof existingPreference?.cadenceDays === "number"
            ? existingPreference.cadenceDays
            : PLANT_UPDATES_CADENCE_DAYS,
        nextPlantOrder:
          typeof existingPreference?.nextPlantOrder === "number"
            ? existingPreference.nextPlantOrder
            : 1,
        nextSendAt: existingPreference?.nextSendAt ?? serverTimestamp(),
        subscription: subscription.toJSON(),
        subscribedAt: existingPreference?.subscribedAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true },
  );

  return { enabled: true, permission };
}

export async function disablePlantUpdates(userId) {
  let permission = getNotificationPermission();

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Keep Firestore state in sync even if unsubscribe fails locally.
      }
    }
  }

  if (permission === "unsupported") {
    permission = "default";
  }

  await setDoc(
    getUserDoc(userId),
    {
      plantUpdates: {
        enabled: false,
        permission,
        subscription: null,
        updatedAt: serverTimestamp(),
        disabledAt: serverTimestamp(),
      },
    },
    { merge: true },
  );
}

export async function syncPlantUpdatesLanguage(userId, language) {
  await setDoc(
    getUserDoc(userId),
    {
      plantUpdates: {
        language,
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true },
  );
}

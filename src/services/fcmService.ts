import { getApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { db, cleanFirestoreData, getAuthHeaders } from '../firebase';
import { UserNotificationSettings, FcmDeviceTokenDoc, FcmTokenEntry } from '../types';

const LOCAL_TOKEN_KEY = 'wavelink_fcm_token';
const LOCAL_TOKEN_ID_KEY = 'wavelink_fcm_token_id';
const LOCAL_DEVICE_ID_KEY = 'wavelink_device_id';
const MAX_DEVICES_PER_USER = 5;

export const DEFAULT_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  masterEnabled: true,
  messages: true,
  calls: true,
  followers: true,
  likesAndComments: true,
  reactions: true,
  replies: true,
  followedPosts: true,
  challenges: true,
  announcements: true,
  payments: true,
  soundAndVibration: true,
  showMessagePreviews: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezoneOffsetMinutes: typeof window !== 'undefined' ? new Date().getTimezoneOffset() : -180
};

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceDisplayName(): string {
  if (typeof window === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  let os = 'Device';
  if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/macintosh|mac os x/i.test(ua)) os = 'Mac';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return `${browser} on ${os}`;
}

function hashTokenToId(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  const cleanPrefix = token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `tok_${cleanPrefix}_${Math.abs(hash).toString(36)}`;
}

export function getVapidPublicKey(): string {
  return typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY
    ? String((import.meta as any).env.VITE_FIREBASE_VAPID_KEY).trim()
    : '';
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function getSavedDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  const tok = localStorage.getItem(LOCAL_TOKEN_KEY);
  if (tok && tok.startsWith('fcm_web_')) return null;
  return tok;
}

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export async function getMessagingServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }
  let swReg =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
    (await navigator.serviceWorker.getRegistration('/'));
  if (!swReg) {
    swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  }
  const readyReg = await navigator.serviceWorker.ready;
  const finalReg = swReg || readyReg;
  if (!finalReg) {
    throw new Error('Service worker could not become active.');
  }
  return finalReg;
}

/**
 * Checks whether this browser device has a saved real FCM token in `userProfile.fcmTokens`.
 */
export function getDeviceSavedTokenFromUserDoc(
  userProfile?: { fcmTokens?: FcmTokenEntry[] } | null
): string | null {
  if (!userProfile || !Array.isArray(userProfile.fcmTokens)) return null;
  const deviceId = getOrCreateDeviceId();
  const localToken = getSavedDeviceToken();

  const match = userProfile.fcmTokens.find(
    (item) =>
      item &&
      typeof item.token === 'string' &&
      item.token.trim().length > 0 &&
      !item.token.startsWith('fcm_web_') &&
      (item.deviceId === deviceId || (Boolean(localToken) && item.token === localToken))
  );
  return match?.token || null;
}

/**
 * Fetches `users/{userId}.fcmTokens` directly from Firestore to verify whether this device has a saved token.
 */
export async function fetchDeviceTokenFromUserDoc(userId: string): Promise<{
  tokenInDoc: string | null;
  allTokens: FcmTokenEntry[];
}> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  const rawTokens =
    userSnap.exists() && Array.isArray(userSnap.data()?.fcmTokens)
      ? (userSnap.data()!.fcmTokens as FcmTokenEntry[])
      : [];
  const tokenInDoc = getDeviceSavedTokenFromUserDoc({ fcmTokens: rawTokens });
  return { tokenInDoc, allTokens: rawTokens };
}

export type NotificationStatusKind = 'on' | 'blocked' | 'not_set_up';

export function getNotificationStatusKind(
  permission: NotificationPermission | 'unsupported',
  savedTokenInUserDoc: string | null
): NotificationStatusKind {
  if (permission === 'denied') return 'blocked';
  if (permission === 'granted' && Boolean(savedTokenInUserDoc)) return 'on';
  return 'not_set_up';
}

/**
 * Closes any lingering OS incoming call notification matching callId in the Service Worker.
 */
export async function closeCallNotificationInSW(callId?: string): Promise<void> {
  if (!callId || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const msg = { type: 'WAVELINK_CLOSE_CALL_NOTIFICATION', callId };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
    const reg =
      (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
      (await navigator.serviceWorker.getRegistration('/'));
    if (reg?.active) {
      reg.active.postMessage(msg);
    }
    if (reg && typeof reg.getNotifications === 'function') {
      const list = await reg.getNotifications({ tag: `wavelink-call-${callId}` });
      list.forEach((n) => n.close());
    }
  } catch {
    // ignore SW notification close errors
  }
}

/**
 * Passively syncs user's notification settings to the backend server.
 */
export async function syncNotificationSettingsToServer(
  userId: string,
  settings: UserNotificationSettings
): Promise<void> {
  if (!userId) return;
  try {
    const headers = await getAuthHeaders();
    await fetch('/api/notifications/sync-settings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId,
        settings: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...settings,
          timezoneOffsetMinutes: new Date().getTimezoneOffset()
        }
      })
    });
  } catch (err) {
    console.warn('Could not sync notification settings to server (non-fatal):', err);
  }
}

/**
 * Saves the user's NotificationSettings in Firestore (`users/{userId}`) and syncs to server.
 */
export async function saveUserNotificationSettings(
  userId: string,
  settings: UserNotificationSettings
): Promise<void> {
  if (!userId) return;
  const normalized: UserNotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    updatedAt: new Date().toISOString()
  };

  await updateDoc(doc(db, 'users', userId), {
    notificationSettings: cleanFirestoreData(normalized),
    updatedAt: normalized.updatedAt
  });

  await syncNotificationSettingsToServer(userId, normalized);
}

/**
 * Upserts a real device FCM token into `users/{userId}.fcmTokens` (max 5 devices)
 * and keeps `users/{userId}/fcmTokens/{tokenId}` synced.
 */
async function persistTokenEntryForUser(
  userId: string,
  fcmToken: string
): Promise<{ tokenId: string; entry: FcmTokenEntry }> {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceDisplayName();
  const platform = (navigator.platform || 'web').slice(0, 60);
  const nowIso = new Date().toISOString();
  const tokenId = hashTokenToId(fcmToken);

  const userRef = doc(db, 'users', userId);
  let existingTokens: FcmTokenEntry[] = [];
  let userDocExists = false;
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    userDocExists = true;
    if (Array.isArray(userSnap.data()?.fcmTokens)) {
      existingTokens = userSnap.data()!.fcmTokens as FcmTokenEntry[];
    }
  }

  const prevForDevice = existingTokens.find(
    (item) => item && (item.deviceId === deviceId || item.token === fcmToken)
  );

  const entry: FcmTokenEntry = {
    token: fcmToken,
    deviceId,
    deviceName,
    platform,
    createdAt: prevForDevice?.createdAt || nowIso,
    lastUsedAt: nowIso
  };

  const filtered = existingTokens.filter(
    (item) =>
      item &&
      typeof item.token === 'string' &&
      !item.token.startsWith('fcm_web_') &&
      item.deviceId !== deviceId &&
      item.token !== fcmToken
  );

  const nextArray = [entry, ...filtered].slice(0, MAX_DEVICES_PER_USER);

  if (userDocExists) {
    await updateDoc(userRef, {
      fcmTokens: cleanFirestoreData(nextArray),
      updatedAt: nowIso
    });
  } else {
    await setDoc(
      userRef,
      {
        uid: userId,
        fcmTokens: cleanFirestoreData(nextArray),
        updatedAt: nowIso
      },
      { merge: true }
    );
  }

  // Also persist in subcollection for backwards compatibility & server test lookups
  const tokenDoc: FcmDeviceTokenDoc = {
    id: tokenId,
    token: fcmToken,
    userId,
    deviceId,
    deviceName,
    platform,
    userAgent: navigator.userAgent.slice(0, 240),
    isIOS: isIOSDevice(),
    isStandalone: isStandalonePWA(),
    createdAt: entry.createdAt,
    updatedAt: nowIso
  };
  await setDoc(
    doc(db, 'users', userId, 'fcmTokens', tokenId),
    cleanFirestoreData(tokenDoc),
    { merge: true }
  ).catch((subErr) => {
    console.warn('[WaveLink Push] Subcollection token mirror skipped:', subErr);
  });

  return { tokenId, entry };
}

/**
 * Explicitly asks for push notification permission ONLY after the user taps a button.
 * Never call this function automatically on initial page load.
 */
export async function requestPushPermissionAndSaveToken(userId: string): Promise<{
  success: boolean;
  token?: string;
  permission: NotificationPermission | 'unsupported';
  error?: string;
  failedStep?: 'permission' | 'support' | 'service_worker' | 'token' | 'save';
  needsHomeScreenInstall?: boolean;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    if (isIOSDevice() && !isStandalonePWA()) {
      return {
        success: false,
        permission: 'unsupported',
        failedStep: 'support',
        needsHomeScreenInstall: true,
        error:
          'On iPhone, tap the Share button in Safari and select "Add to Home Screen" first to enable push notifications.'
      };
    }
    return {
      success: false,
      permission: 'unsupported',
      failedStep: 'support',
      error: 'Push notifications are not supported by this browser.'
    };
  }

  // Step 1: Request browser permission if needed
  let permission: NotificationPermission = Notification.permission;
  if (permission !== 'granted') {
    try {
      permission = await Notification.requestPermission();
    } catch (permErr: any) {
      console.error('[WaveLink Push] Permission request failed:', permErr);
      return {
        success: false,
        permission: getBrowserNotificationPermission(),
        failedStep: 'permission',
        error: `Permission request failed: ${permErr?.message || String(permErr)}`
      };
    }
  }

  if (permission !== 'granted') {
    if (permission === 'denied') {
      await removeCurrentDeviceFcmToken(userId).catch(() => {});
    }
    return {
      success: false,
      permission,
      failedStep: 'permission',
      error:
        permission === 'denied'
          ? 'Notifications are blocked in the browser. Follow the Chrome unblock steps below and tap Re-check.'
          : 'Notification permission request was dismissed before allowing notifications.'
    };
  }

  // Step 2: Check Firebase Messaging support & register service worker
  let messagingSupported = false;
  try {
    messagingSupported = await isSupported();
  } catch (supportErr: any) {
    console.error('[WaveLink Push] Messaging support check failed:', supportErr);
    return {
      success: false,
      permission: 'granted',
      failedStep: 'support',
      error: `Browser push check failed: ${supportErr?.message || String(supportErr)}`
    };
  }

  if (!messagingSupported) {
    return {
      success: false,
      permission: 'granted',
      failedStep: 'support',
      error:
        isIOSDevice() && !isStandalonePWA()
          ? 'On iPhone, open WaveLink from your Home Screen icon after tapping Share -> Add to Home Screen.'
          : 'Firebase Cloud Messaging is not supported in this browser context (HTTPS and Push API required).'
    };
  }

  let swReg: ServiceWorkerRegistration;
  try {
    swReg = await getMessagingServiceWorkerRegistration();
  } catch (swErr: any) {
    console.error('[WaveLink Push] Service worker registration failed:', swErr);
    return {
      success: false,
      permission: 'granted',
      failedStep: 'service_worker',
      error: `Service worker registration failed: ${swErr?.message || String(swErr)}`
    };
  }

  // Step 3: Get FCM token (without vapidKey if VITE_FIREBASE_VAPID_KEY is missing or empty)
  const vapidKey = getVapidPublicKey();
  let fcmToken = '';
  try {
    const messaging = getMessaging(getApp());
    const tokenOptions: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string } = {
      serviceWorkerRegistration: swReg
    };
    if (vapidKey) {
      tokenOptions.vapidKey = vapidKey;
    }
    fcmToken = await getToken(messaging, tokenOptions);
  } catch (tokenErr: any) {
    console.error('[WaveLink Push] FCM token registration failed:', tokenErr);
    return {
      success: false,
      permission: 'granted',
      failedStep: 'token',
      error: `Failed to get FCM token: ${tokenErr?.message || String(tokenErr)}`
    };
  }

  if (!fcmToken) {
    return {
      success: false,
      permission: 'granted',
      failedStep: 'token',
      error: 'Firebase Cloud Messaging returned an empty registration token.'
    };
  }

  // Step 4: Save FCM token to user document's fcmTokens array
  let tokenId = '';
  let entry: FcmTokenEntry;
  try {
    const saved = await persistTokenEntryForUser(userId, fcmToken);
    tokenId = saved.tokenId;
    entry = saved.entry;
  } catch (saveErr: any) {
    console.error('[WaveLink Push] Saving FCM token to Firestore failed:', saveErr);
    return {
      success: false,
      permission: 'granted',
      failedStep: 'save',
      error: `Failed to save FCM token to your user document: ${saveErr?.message || String(saveErr)}`
    };
  }

  localStorage.setItem(LOCAL_TOKEN_KEY, fcmToken);
  localStorage.setItem(LOCAL_TOKEN_ID_KEY, tokenId);

  // Register with local Express server as well for immediate server test alerts (non-fatal)
  try {
    const headers = await getAuthHeaders();
    await fetch('/api/notifications/register-token', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId,
        tokenId,
        token: fcmToken,
        deviceId: entry.deviceId,
        deviceName: entry.deviceName,
        platform: entry.platform
      })
    });
  } catch {
    // non-fatal
  }

  return {
    success: true,
    token: fcmToken,
    permission: 'granted'
  };
}

/**
 * Deletes the current device's FCM token from `users/{userId}.fcmTokens`, subcollection, server, and FCM SDK.
 * Called on logout or when permission is revoked / user disables push on this device.
 */
export async function removeCurrentDeviceFcmToken(userId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const deviceId = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedTokenId =
    localStorage.getItem(LOCAL_TOKEN_ID_KEY) || (savedToken ? hashTokenToId(savedToken) : null);

  localStorage.removeItem(LOCAL_TOKEN_KEY);
  localStorage.removeItem(LOCAL_TOKEN_ID_KEY);

  if (userId) {
    // 1. Remove from users/{userId}.fcmTokens array
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists() && Array.isArray(snap.data()?.fcmTokens)) {
        const currentArr = snap.data()!.fcmTokens as FcmTokenEntry[];
        const nextArr = currentArr.filter(
          (item) =>
            item &&
            item.deviceId !== deviceId &&
            (!savedToken || item.token !== savedToken) &&
            !String(item.token || '').startsWith('fcm_web_')
        );
        if (nextArr.length !== currentArr.length) {
          await updateDoc(userRef, { fcmTokens: cleanFirestoreData(nextArr) });
        }
      }
    } catch (err) {
      console.warn('Could not clean FCM token from user array:', err);
    }

    // 2. Delete from subcollection
    if (savedTokenId) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'fcmTokens', savedTokenId));
      } catch {
        // ignore
      }
    }

    // 3. Unregister from Express server cache
    if (savedToken || savedTokenId) {
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/notifications/unregister-token', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId,
            tokenId: savedTokenId,
            token: savedToken
          })
        });
      } catch {
        // ignore during logout
      }
    }
  }

  // 4. Delete token from Firebase Messaging SDK
  try {
    const supported = await isSupported().catch(() => false);
    if (supported) {
      const messaging = getMessaging(getApp());
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Passively checks permission state after sign-in without ever prompting the user.
 * Refreshes the token / lastUsedAt if permission is already granted, or cleans up stale tokens if revoked.
 */
export async function syncExistingDeviceTokenState(
  userId: string,
  settings?: UserNotificationSettings
): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;

  await syncNotificationSettingsToServer(userId, settings || DEFAULT_NOTIFICATION_SETTINGS);

  if (!('Notification' in window)) return;

  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedTokenId = localStorage.getItem(LOCAL_TOKEN_ID_KEY);

  if (Notification.permission !== 'granted') {
    if (savedToken || savedTokenId) {
      await removeCurrentDeviceFcmToken(userId);
    }
    return;
  }

  // Permission is already granted — silently ensure token & lastUsedAt are fresh
  try {
    const vapidKey = getVapidPublicKey();
    const supported = await isSupported().catch(() => false);
    if (supported) {
      const swReg = await getMessagingServiceWorkerRegistration();
      const messaging = getMessaging(getApp());
      const tokenOptions: { serviceWorkerRegistration?: ServiceWorkerRegistration; vapidKey?: string } = {
        serviceWorkerRegistration: swReg
      };
      if (vapidKey) {
        tokenOptions.vapidKey = vapidKey;
      }
      const freshToken = await getToken(messaging, tokenOptions).catch((tokenErr) => {
        console.error('[WaveLink Push] FCM token registration failed during sync:', tokenErr);
        return '';
      });
      if (freshToken) {
        const tokenChanged = freshToken !== savedToken;
        const lastSyncKey = `wavelink_fcm_last_sync_${userId}`;
        const lastSyncMs = Number(localStorage.getItem(lastSyncKey) || '0');
        const needsTimestampBump = Date.now() - lastSyncMs > 12 * 60 * 60 * 1000;
        if (tokenChanged || needsTimestampBump) {
          const { tokenId, entry } = await persistTokenEntryForUser(userId, freshToken);
          localStorage.setItem(LOCAL_TOKEN_KEY, freshToken);
          localStorage.setItem(LOCAL_TOKEN_ID_KEY, tokenId);
          localStorage.setItem(lastSyncKey, String(Date.now()));
          const headers = await getAuthHeaders();
          fetch('/api/notifications/register-token', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId,
              tokenId,
              token: freshToken,
              deviceId: entry.deviceId,
              deviceName: entry.deviceName,
              platform: entry.platform
            })
          }).catch(() => {});
        }
        return;
      }
    }
  } catch {
    // non-fatal
  }

  // Also sync any existing tokens from subcollection to server cache
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'fcmTokens'));
    const headers = await getAuthHeaders();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as FcmDeviceTokenDoc;
      if (data?.token && !data.token.startsWith('fcm_web_')) {
        fetch('/api/notifications/register-token', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId,
            tokenId: docSnap.id,
            token: data.token,
            platform: data.platform || 'web',
            userAgent: data.userAgent || ''
          })
        }).catch(() => {});
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Triggers a real test push notification via the backend server (`/api/notifications/send-test`).
 */
export async function sendTestPushNotificationToSelf(): Promise<{
  sent: boolean;
  successCount?: number;
  totalTokens?: number;
  invalidRemovedCount?: number;
  reason?: string;
  error?: string;
}> {
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/notifications/send-test', {
    method: 'POST',
    headers
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      sent: false,
      error: data?.error || `Server returned ${resp.status}`
    };
  }
  return data;
}

/**
 * Attaches a foreground FCM message listener when permission is granted.
 */
export function subscribeToForegroundPushMessages(
  onPayload: (payload: {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    data?: Record<string, string>;
  }) => void
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;

  isSupported()
    .then((supported) => {
      if (!supported || cancelled) return;
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const messaging = getMessaging(getApp());
          unsub = onMessage(messaging, (payload) => {
            const data = (payload.data || {}) as Record<string, string>;
            if (data.type === 'call_dismiss' && data.callId) {
              closeCallNotificationInSW(data.callId);
              return;
            }
            const title = payload.notification?.title || data.title || 'WaveLink';
            const body = payload.notification?.body || data.body || '';
            const icon = payload.notification?.icon || data.icon;
            const image = (payload.notification as any)?.image || data.image;
            onPayload({
              title,
              body,
              icon,
              image,
              data
            });
          });
        } catch {
          // ignore
        }
      }
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

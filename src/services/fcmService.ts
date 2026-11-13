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

export async function getMessagingServiceWorkerRegistration(): Promise<
  ServiceWorkerRegistration | undefined
> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  let swReg =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
    (await navigator.serviceWorker.getRegistration('/'));
  if (!swReg) {
    swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  }
  await navigator.serviceWorker.ready;
  return swReg;
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
  try {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && Array.isArray(userSnap.data()?.fcmTokens)) {
      existingTokens = userSnap.data()!.fcmTokens as FcmTokenEntry[];
    }
  } catch {
    // ignore read error; proceed with fresh array
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

  await updateDoc(userRef, {
    fcmTokens: cleanFirestoreData(nextArray),
    updatedAt: nowIso
  });

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
  ).catch(() => {});

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
  needsHomeScreenInstall?: boolean;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    if (isIOSDevice() && !isStandalonePWA()) {
      return {
        success: false,
        permission: 'unsupported',
        needsHomeScreenInstall: true,
        error:
          'On iPhone, tap the Share button in Safari and select "Add to Home Screen" first to enable push notifications.'
      };
    }
    return {
      success: false,
      permission: 'unsupported',
      error: 'Push notifications are not supported by this browser.'
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission === 'denied') {
        await removeCurrentDeviceFcmToken(userId);
      }
      return {
        success: false,
        permission,
        error:
          permission === 'denied'
            ? 'Notification permission was blocked. You can re-enable it anytime in your browser site settings.'
            : 'Notification permission request was dismissed.'
      };
    }

    const swReg = await getMessagingServiceWorkerRegistration();
    const vapidKey = getVapidPublicKey();

    const messagingSupported = await isSupported().catch(() => false);
    if (!messagingSupported) {
      return {
        success: false,
        permission: 'granted',
        error:
          isIOSDevice() && !isStandalonePWA()
            ? 'On iPhone, open WaveLink from your Home Screen icon after tapping Share -> Add to Home Screen.'
            : 'Firebase Cloud Messaging is not supported in this browser context (HTTPS required).'
      };
    }

    const messaging = getMessaging(getApp());
    let fcmToken = '';
    try {
      const tokenOptions: { serviceWorkerRegistration?: ServiceWorkerRegistration; vapidKey?: string } = {
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
        error: tokenErr?.message || 'Could not retrieve a push registration token from Firebase Cloud Messaging.'
      };
    }

    if (!fcmToken) {
      return {
        success: false,
        permission: 'granted',
        error: 'Could not retrieve a push registration token from Firebase Cloud Messaging.'
      };
    }

    const { tokenId, entry } = await persistTokenEntryForUser(userId, fcmToken);

    localStorage.setItem(LOCAL_TOKEN_KEY, fcmToken);
    localStorage.setItem(LOCAL_TOKEN_ID_KEY, tokenId);

    // Register with local Express server as well for immediate server test alerts
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
  } catch (err: any) {
    console.error('[WaveLink Push] Error enabling push notifications:', err);
    return {
      success: false,
      permission: getBrowserNotificationPermission(),
      error: err?.message || 'Could not enable push notifications on this device.'
    };
  }
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

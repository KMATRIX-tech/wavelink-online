import { getApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { db, cleanFirestoreData, getAuthHeaders } from '../firebase';
import { UserNotificationSettings, FcmDeviceTokenDoc, FcmTokenEntry } from '../types';

const LOCAL_TOKEN_KEY = 'wavelink_fcm_token';
const LOCAL_TOKEN_ID_KEY = 'wavelink_fcm_token_id';
const LOCAL_DEVICE_ID_KEY = 'wavelink_device_id';

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
 * Checks whether this browser device has a saved real FCM token in `localStorage` or fallback profile data.
 */
export function getDeviceSavedTokenFromUserDoc(
  userProfile?: { fcmTokens?: FcmTokenEntry[] } | null
): string | null {
  const localToken = getSavedDeviceToken();
  if (localToken) return localToken;
  if (!userProfile || !Array.isArray(userProfile.fcmTokens)) return null;
  const deviceId = getOrCreateDeviceId();

  const match = userProfile.fcmTokens.find(
    (item) =>
      item &&
      typeof item.token === 'string' &&
      item.token.trim().length > 0 &&
      !item.token.startsWith('fcm_web_') &&
      (item.deviceId === deviceId || item.deviceName === getDeviceDisplayName())
  );
  return match?.token || null;
}

/**
 * Fetches `users/{userId}/fcmTokens` directly from Firestore to verify whether this device has a saved token.
 */
export async function fetchDeviceTokenFromUserDoc(userId: string): Promise<{
  tokenInDoc: string | null;
  allTokens: FcmTokenEntry[];
}> {
  const snap = await getDocs(collection(db, 'users', userId, 'fcmTokens'));
  const allTokens: FcmTokenEntry[] = [];
  const localToken = getSavedDeviceToken();
  const currentDeviceName = getDeviceDisplayName();
  let tokenInDoc: string | null = null;

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const tok =
      typeof data.token === 'string' && data.token.trim().length > 0
        ? data.token.trim()
        : docSnap.id;
    if (!tok || tok.startsWith('fcm_web_')) return;

    const entry: FcmTokenEntry = {
      token: tok,
      deviceId: typeof data.deviceId === 'string' ? data.deviceId : docSnap.id,
      deviceName: typeof data.deviceName === 'string' ? data.deviceName : currentDeviceName,
      platform: typeof data.platform === 'string' ? data.platform : 'web',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
      lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : ''
    };
    allTokens.push(entry);

    if (localToken && (tok === localToken || docSnap.id === localToken)) {
      tokenInDoc = tok;
    }
  });

  if (!tokenInDoc && getBrowserNotificationPermission() === 'granted') {
    const byDevice = allTokens.find((item) => item.deviceName === currentDeviceName);
    if (byDevice) {
      tokenInDoc = byDevice.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_TOKEN_KEY, byDevice.token);
        localStorage.setItem(LOCAL_TOKEN_ID_KEY, byDevice.token);
      }
    }
  }

  return { tokenInDoc, allTokens };
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
 * Loads the user's NotificationSettings from `users/{userId}/settings/notifications`.
 */
export async function fetchUserNotificationSettings(
  userId: string,
  fallbackSettings?: Partial<UserNotificationSettings>
): Promise<UserNotificationSettings> {
  if (!userId) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(fallbackSettings || {}) };
  }
  const snap = await getDoc(doc(db, 'users', userId, 'settings', 'notifications'));
  if (snap.exists()) {
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(fallbackSettings || {}),
      ...(snap.data() as Partial<UserNotificationSettings>)
    };
  }
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(fallbackSettings || {}) };
}

/**
 * Saves the user's NotificationSettings in Firestore (`users/{userId}/settings/notifications`) and syncs to server.
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

  await setDoc(
    doc(db, 'users', userId, 'settings', 'notifications'),
    cleanFirestoreData(normalized),
    { merge: true }
  );

  await syncNotificationSettingsToServer(userId, normalized);
}

/**
 * Saves a real device FCM token in `users/{userId}/fcmTokens/{token}` with fields:
 * token, deviceName, platform, createdAt, lastUsedAt.
 * Does NOT write fcmTokens to the main user document.
 */
async function persistTokenEntryForUser(
  userId: string,
  fcmToken: string
): Promise<{ tokenId: string; entry: FcmTokenEntry }> {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceDisplayName();
  const platform = (navigator.platform || 'web').slice(0, 60);
  const nowIso = new Date().toISOString();
  const tokenId = fcmToken;
  const tokenRef = doc(db, 'users', userId, 'fcmTokens', tokenId);

  let createdAt = nowIso;
  try {
    const existingSnap = await getDoc(tokenRef);
    if (existingSnap.exists() && typeof existingSnap.data()?.createdAt === 'string') {
      createdAt = existingSnap.data()!.createdAt;
    }
  } catch {
    // ignore read error; use nowIso
  }

  const tokenPayload = {
    token: fcmToken,
    deviceName,
    platform,
    createdAt,
    lastUsedAt: nowIso
  };

  await setDoc(tokenRef, cleanFirestoreData(tokenPayload), { merge: true });

  const entry: FcmTokenEntry = {
    token: fcmToken,
    deviceId,
    deviceName,
    platform,
    createdAt,
    lastUsedAt: nowIso
  };

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

  // Step 4: Save FCM token to users/{uid}/fcmTokens/{token}
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
      error: `Failed to save FCM token to users/${userId}/fcmTokens: ${saveErr?.message || String(saveErr)}`
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
 * Deletes the current device's FCM token from `users/{userId}/fcmTokens/{token}`, server, and FCM SDK.
 * Called on logout or when permission is revoked / user disables push on this device.
 */
export async function removeCurrentDeviceFcmToken(userId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedTokenId =
    localStorage.getItem(LOCAL_TOKEN_ID_KEY) || (savedToken ? hashTokenToId(savedToken) : null);

  localStorage.removeItem(LOCAL_TOKEN_KEY);
  localStorage.removeItem(LOCAL_TOKEN_ID_KEY);

  if (userId) {
    // 1. Delete from users/{userId}/fcmTokens/{token}
    if (savedToken) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'fcmTokens', savedToken));
      } catch {
        // ignore
      }
    }
    if (savedTokenId && savedTokenId !== savedToken) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'fcmTokens', savedTokenId));
      } catch {
        // ignore
      }
    }

    // 2. Unregister from Express server cache
    if (savedToken || savedTokenId) {
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/notifications/unregister-token', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId,
            tokenId: savedToken || savedTokenId,
            token: savedToken
          })
        });
      } catch {
        // ignore during logout
      }
    }
  }

  // 3. Delete token from Firebase Messaging SDK
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

  const effectiveSettings = await fetchUserNotificationSettings(userId, settings).catch(
    () => settings || DEFAULT_NOTIFICATION_SETTINGS
  );
  await syncNotificationSettingsToServer(userId, effectiveSettings);

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

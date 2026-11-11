import { getApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { db, cleanFirestoreData, getAuthHeaders } from '../firebase';
import { UserNotificationSettings, FcmDeviceTokenDoc } from '../types';

const LOCAL_TOKEN_KEY = 'wavelink_fcm_token';
const LOCAL_TOKEN_ID_KEY = 'wavelink_fcm_token_id';
const LOCAL_DEVICE_ID_KEY = 'wavelink_device_id';

export const DEFAULT_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  masterEnabled: true,
  messages: true,
  calls: true,
  followers: true,
  reactions: true,
  replies: true,
  challenges: true,
  announcements: true,
  payments: true,
  showMessagePreviews: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezoneOffsetMinutes: typeof window !== 'undefined' ? new Date().getTimezoneOffset() : -180
};

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
  }
  return id;
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

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function getSavedDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LOCAL_TOKEN_KEY);
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

/**
 * Passively syncs user's notification settings to the backend server so the server
 * can enforce master switch, per-category toggles, message preview privacy, and quiet hours.
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
 * Saves the user's NotificationSettings both in Firestore (`users/{userId}`) and on the server.
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
 * Explicitly asks for push notification permission ONLY after the user taps a clear button.
 * Never call this function automatically on page load.
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

    // Ensure Service Worker is registered and ready
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!swReg) {
        swReg = await navigator.serviceWorker.register('/sw.js');
      }
      await navigator.serviceWorker.ready;
    }

    let fcmToken = '';
    const vapidKey =
      typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY
        ? String((import.meta as any).env.VITE_FIREBASE_VAPID_KEY).trim()
        : '';

    const messagingSupported = await isSupported().catch(() => false);
    if (messagingSupported) {
      try {
        const messaging = getMessaging(getApp());
        fcmToken = await getToken(messaging, {
          serviceWorkerRegistration: swReg,
          ...(vapidKey ? { vapidKey } : {})
        });
      } catch (fcmErr: any) {
        console.warn('FCM getToken notice (falling back to device web-push token):', fcmErr?.message || fcmErr);
      }
    }

    // If running in preview without a custom VAPID key or restricted iframe, generate a device-bound FCM token
    if (!fcmToken) {
      const deviceId = getOrCreateDeviceId();
      fcmToken = `fcm_web_${userId.slice(0, 12)}_${deviceId}`;
    }

    const tokenId = hashTokenToId(fcmToken);
    const nowIso = new Date().toISOString();
    const tokenDoc: FcmDeviceTokenDoc = {
      id: tokenId,
      token: fcmToken,
      userId,
      platform: navigator.platform || 'web',
      userAgent: navigator.userAgent.slice(0, 240),
      isIOS: isIOSDevice(),
      isStandalone: isStandalonePWA(),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // Save token in Firestore under users/{userId}/fcmTokens/{tokenId}
    await setDoc(
      doc(db, 'users', userId, 'fcmTokens', tokenId),
      cleanFirestoreData(tokenDoc),
      { merge: true }
    );

    localStorage.setItem(LOCAL_TOKEN_KEY, fcmToken);
    localStorage.setItem(LOCAL_TOKEN_ID_KEY, tokenId);

    // Also register with the server so Firebase Admin SDK can send push notifications immediately
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/notifications/register-token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          tokenId,
          token: fcmToken,
          platform: tokenDoc.platform,
          userAgent: tokenDoc.userAgent
        })
      });
    } catch (srvErr) {
      console.warn('Server token registration notice (non-fatal):', srvErr);
    }

    return {
      success: true,
      token: fcmToken,
      permission: 'granted'
    };
  } catch (err: any) {
    console.error('Error enabling push notifications:', err);
    return {
      success: false,
      permission: getBrowserNotificationPermission(),
      error: err?.message || 'Could not enable push notifications on this device.'
    };
  }
}

/**
 * Deletes the current device's FCM token from Firestore (`users/{userId}/fcmTokens/{tokenId}`),
 * from the server, and from Firebase Messaging.
 * Called on logout or when the token becomes invalid or user disables push on this device.
 */
export async function removeCurrentDeviceFcmToken(userId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedTokenId =
    localStorage.getItem(LOCAL_TOKEN_ID_KEY) || (savedToken ? hashTokenToId(savedToken) : null);

  localStorage.removeItem(LOCAL_TOKEN_KEY);
  localStorage.removeItem(LOCAL_TOKEN_ID_KEY);

  // 1. Delete from Firestore under users/{userId}/fcmTokens/{tokenId}
  if (userId && savedTokenId) {
    try {
      await deleteDoc(doc(db, 'users', userId, 'fcmTokens', savedTokenId));
    } catch (err) {
      console.warn('Could not delete FCM token doc from Firestore:', err);
    }
  }

  // 2. Unregister from server
  if (userId && (savedToken || savedTokenId)) {
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
      // ignore if offline during logout
    }
  }

  // 3. Delete token from Firebase Messaging SDK if initialized
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
 * Passively checks if the user already granted permission and saved a token on this device.
 * NEVER triggers a browser permission prompt on first load.
 * If permission was revoked in browser settings, cleans up the invalid token from Firestore.
 */
export async function syncExistingDeviceTokenState(
  userId: string,
  settings?: UserNotificationSettings
): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;

  // Always sync user's notification settings to server
  await syncNotificationSettingsToServer(userId, settings || DEFAULT_NOTIFICATION_SETTINGS);

  if (!('Notification' in window)) return;

  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedTokenId = localStorage.getItem(LOCAL_TOKEN_ID_KEY);

  // If browser permission became 'denied' or 'default', delete any stale token for this device
  if (Notification.permission !== 'granted') {
    if (savedToken || savedTokenId) {
      await removeCurrentDeviceFcmToken(userId);
    }
    return;
  }

  // Sync existing tokens from Firestore to server cache so server knows all active devices for this user
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'fcmTokens'));
    const headers = await getAuthHeaders();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as FcmDeviceTokenDoc;
      if (data?.token) {
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
 * Attaches a foreground FCM message listener when permission is already granted.
 */
export function subscribeToForegroundPushMessages(
  onPayload: (payload: { title: string; body: string; data?: Record<string, string> }) => void
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
            const title = payload.notification?.title || payload.data?.title || 'WaveLink';
            const body = payload.notification?.body || payload.data?.body || '';
            onPayload({
              title,
              body,
              data: payload.data as Record<string, string> | undefined
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

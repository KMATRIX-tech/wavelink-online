/* eslint-disable no-undef */
// Unified WaveLink Progressive Web App + Firebase Cloud Messaging Service Worker

const CACHE_NAME = 'wavelink-pwa-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png'
];

let fcmMessaging = null;
let fcmSdkInitialized = false;

try {
  importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');

  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp({
        apiKey: 'AIzaSyALKX8B-W86GCjdKYu7hZ_kpoBFL_eCJqI',
        authDomain: 'formal-photon-n48x0.firebaseapp.com',
        projectId: 'formal-photon-n48x0',
        storageBucket: 'formal-photon-n48x0.firebasestorage.app',
        messagingSenderId: '330199068484',
        appId: '1:330199068484:web:5376c71f8157d471e8f111'
      });
    }
    if (typeof firebase.messaging === 'function') {
      fcmMessaging = firebase.messaging();
      fcmSdkInitialized = true;
    }
  }
} catch (err) {
  // Offline or restricted environment: PWA shell and fallback push still work safely
  fcmSdkInitialized = false;
}

function sanitizeImageOrIconUrl(rawUrl, fallback) {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) return fallback;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return fallback;
  if (trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return fallback;
}

async function closeCallNotificationsById(callId) {
  if (!callId) return;
  const tag = `wavelink-call-${callId}`;
  try {
    const notifications = await self.registration.getNotifications({ tag });
    notifications.forEach((n) => n.close());
  } catch {
    // ignore getNotifications errors
  }
}

async function showWaveLinkNotification(payload) {
  const notif = payload?.notification || {};
  const data = payload?.data || {};
  const notifType = String(data.type || 'system');

  // Silent dismissal signal when a ringing call is answered, declined, or ended elsewhere
  if (notifType === 'call_dismiss') {
    const callId = data.callId || data.entityId || '';
    await closeCallNotificationsById(callId);
    return;
  }

  const isIncomingCall = notifType === 'incoming_call' || notifType === 'call';
  const isMissedCall = notifType === 'missed_call';
  const isSilent = data.silent === 'true' || data.soundAndVibration === 'false';
  const callId = data.callId || data.entityId || 'active';

  const title =
    notif.title ||
    data.title ||
    (isIncomingCall ? 'Incoming WaveLink Call' : isMissedCall ? 'Missed WaveLink Call' : 'WaveLink');
  const body =
    notif.body ||
    data.body ||
    (isIncomingCall
      ? 'Tap Answer to join the call or Decline.'
      : 'Tap to open WaveLink.');

  const icon = sanitizeImageOrIconUrl(notif.icon || data.icon || data.actorPhotoURL, '/pwa-192x192.png');
  const image = sanitizeImageOrIconUrl(notif.image || data.image, undefined);

  const tag =
    isIncomingCall || isMissedCall
      ? `wavelink-call-${callId}`
      : data.tag || (data.channelId ? `wavelink-chat-${data.channelId}` : notifType || 'wavelink-notification');

  const actions = isIncomingCall
    ? [
        { action: 'answer_call', title: 'Answer' },
        { action: 'decline_call', title: 'Decline' }
      ]
    : [];

  let defaultUrl = data.url || '/';
  if (!data.url) {
    if (isIncomingCall) {
      defaultUrl = `/?callAction=answer&callId=${encodeURIComponent(callId)}`;
    } else if (notifType === 'message' && data.channelId) {
      defaultUrl = `/?tab=chat&channelId=${encodeURIComponent(data.channelId)}`;
    } else if (notifType === 'follow' && data.actorId) {
      defaultUrl = `/?tab=settings&userId=${encodeURIComponent(data.actorId)}`;
    } else if ((notifType === 'post_like' || notifType === 'post_comment' || notifType === 'followed_post') && data.postId) {
      defaultUrl = `/?tab=feed&postId=${encodeURIComponent(data.postId)}`;
    }
  }

  const options = {
    body,
    icon,
    badge: '/pwa-192x192.png',
    ...(image ? { image } : {}),
    tag,
    renotify: true,
    silent: isSilent,
    ...(isSilent
      ? {}
      : {
          vibrate: isIncomingCall
            ? [450, 180, 450, 180, 500, 180, 600]
            : [180, 80, 180]
        }),
    requireInteraction: isIncomingCall,
    actions,
    data: {
      url: defaultUrl,
      type: notifType,
      entityId: data.entityId || callId || '',
      callId: isIncomingCall || isMissedCall ? callId : '',
      callType: data.callType || 'video',
      channelId: data.channelId || '',
      postId: data.postId || '',
      actorId: data.actorId || '',
      actorName: data.actorName || ''
    }
  };

  await self.registration.showNotification(title, options);
}

if (fcmSdkInitialized && fcmMessaging) {
  fcmMessaging.onBackgroundMessage((payload) => {
    return showWaveLinkNotification(payload);
  });
} else {
  // Fallback push listener only when Firebase compat SDK could not initialize (e.g., offline)
  self.addEventListener('push', (event) => {
    let payload = {};
    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        payload = {
          notification: {
            title: 'WaveLink',
            body: event.data.text() || 'You have a new update on WaveLink.'
          }
        };
      }
    }
    event.waitUntil(showWaveLinkNotification(payload));
  });
}

// Allow active client pages to dismiss stale call notifications cleanly
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'WAVELINK_CLOSE_CALL_NOTIFICATION' && msg.callId) {
    event.waitUntil(closeCallNotificationsById(String(msg.callId)));
  } else if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle notification clicks & incoming call Answer / Decline action buttons
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const action = event.action || 'open';
  const callAction =
    action === 'answer_call'
      ? 'answer'
      : action === 'decline_call'
      ? 'decline'
      : null;

  const targetCallId = notifData.callId || notifData.entityId || '';
  const targetUrl = callAction
    ? `/?callAction=${encodeURIComponent(callAction)}&callId=${encodeURIComponent(
        targetCallId
      )}&callerId=${encodeURIComponent(notifData.actorId || '')}&callType=${encodeURIComponent(
        notifData.callType || 'video'
      )}`
    : notifData.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: callAction ? 'WAVELINK_CALL_NOTIFICATION_ACTION' : 'WAVELINK_NOTIFICATION_CLICK',
            action: callAction || 'open',
            callId: targetCallId,
            callerId: notifData.actorId || '',
            callerName: notifData.actorName || '',
            callType: notifData.callType || 'video',
            url: targetUrl,
            data: notifData
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// PWA install, activate, and offline-resilient fetch caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/firebase-messaging-sw.js' ||
    url.pathname === '/sw.js' ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('fcmregistrations.googleapis.com') ||
    url.hostname.includes('cloudinary.com')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => undefined);
    })
  );
});

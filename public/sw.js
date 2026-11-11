const CACHE_NAME = 'wavelink-pwa-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

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
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('fcmregistrations.googleapis.com') ||
    url.hostname.includes('cloudinary.com')
  ) {
    return;
  }

  // Network-first for HTML navigation so fresh releases load immediately with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
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
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Handle incoming Firebase Cloud Messaging & Web Push notifications
// Supports messages, followers, reactions, replies, challenge reminders, and loud incoming calls with Answer/Decline buttons
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

  const notif = payload.notification || {};
  const data = payload.data || {};
  const notifType = data.type || 'system';
  const isIncomingCall = notifType === 'incoming_call' || notifType === 'call';

  const title = notif.title || data.title || (isIncomingCall ? 'Incoming WaveLink Call 📞' : 'WaveLink');
  const body =
    notif.body ||
    data.body ||
    (isIncomingCall ? 'Tap Answer to join the call or Decline.' : 'Tap to open WaveLink.');
  const icon = notif.icon || data.icon || '/pwa-192x192.png';
  const tag = isIncomingCall
    ? `wavelink-call-${data.entityId || 'active'}`
    : data.tag || notifType || 'wavelink-notification';

  const actions = isIncomingCall
    ? [
        {
          action: 'answer_call',
          title: '📞 Answer'
        },
        {
          action: 'decline_call',
          title: '✕ Decline'
        }
      ]
    : [];

  const options = {
    body,
    icon,
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    vibrate: isIncomingCall ? [400, 150, 400, 150, 500, 200, 600] : [180, 80, 180],
    requireInteraction: isIncomingCall,
    actions,
    data: {
      url: data.url || '/',
      type: notifType,
      entityId: data.entityId || '',
      actorId: data.actorId || '',
      actorName: data.actorName || ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks, including Answer / Decline buttons on incoming call notifications
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

  const targetUrl = callAction
    ? `/?callAction=${encodeURIComponent(callAction)}&callId=${encodeURIComponent(
        notifData.entityId || ''
      )}`
    : notifData.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: callAction ? 'WAVELINK_CALL_NOTIFICATION_ACTION' : 'WAVELINK_NOTIFICATION_CLICK',
            action: callAction || 'open',
            callId: notifData.entityId || '',
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

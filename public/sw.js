const CACHE_NAME = 'wavelink-pwa-v3';
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
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
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

  // Network-first for HTML navigation so fresh releases load immediately
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
  const title = notif.title || data.title || 'WaveLink';
  const body = notif.body || data.body || 'Tap to open WaveLink.';
  const icon = notif.icon || data.icon || '/pwa-192x192.png';
  const tag = data.tag || data.type || 'wavelink-notification';

  const options = {
    body,
    icon,
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    vibrate: data.type === 'incoming_call' || data.type === 'call' ? [300, 150, 300, 150, 400] : [180, 80, 180],
    requireInteraction: data.type === 'incoming_call' || data.type === 'call',
    data: {
      url: data.url || '/',
      type: data.type || 'system',
      entityId: data.entityId || '',
      actorId: data.actorId || ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus or open WaveLink when a push notification is tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'WAVELINK_NOTIFICATION_CLICK',
            data: event.notification.data || {}
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

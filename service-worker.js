const CACHE_NAME = 'fridge-dashboard-v1';
const urlsToCache = [
  '/fridge-dashboard/',
  '/fridge-dashboard/index.html',
  '/fridge-dashboard/manifest.json',
  '/fridge-dashboard/style.css',
  '/fridge-dashboard/app.js',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js'
];

// Install - Cache dosyaları
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache açıldı');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch - Cache'den sun veya indir
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Activate - Eski cache'leri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eski cache siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Bildirim tıklama
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Zaten açık pencere varsa onu öne getir
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes('/fridge-dashboard/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Açık pencere yoksa yeni aç
        if (clients.openWindow) {
          return clients.openWindow('/fridge-dashboard/');
        }
      })
  );
});

// Push bildirimi (gelecekte kullanılabilir)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Yeni bildirim',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="70" font-size="70">🧊</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="70" font-size="70">🧊</text></svg>',
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification('Buzdolabı Takip', options)
  );
});

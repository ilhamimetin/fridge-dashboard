const CACHE_NAME = 'fridge-dashboard-v1';
const urlsToCache = [
  '/fridge-dashboard/',
  '/fridge-dashboard/index.html',
  '/fridge-dashboard/manifest.json',
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
        // Cache'de varsa döndür
        if (response) {
          return response;
        }
        // Yoksa internetten al
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
```

4. **Commit changes**

---

## 📁 Repository Yapısı Şöyle Olmalı:
```
fridge-dashboard/
├── index.html          ✅ (güncelledin)
├── manifest.json       ⬅️ YENİ
└── service-worker.js   ⬅️ YENİ

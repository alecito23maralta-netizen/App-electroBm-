// Service Worker — Electrodomésticos BM
// Cachea el "app shell" (las pantallas HTML y los íconos) para que la app
// abra al instante y sea instalable, incluso con conexión débil.
// Las llamadas a Supabase (datos en vivo) NUNCA se sirven desde caché.

const CACHE_VERSION = 'bm-app-v1';
const APP_SHELL = [
  'login.html',
  'inicio.html',
  'mercados.html',
  'cotizaciones.html',
  'caja.html',
  'catalogo.html',
  'ventas.html',
  'offline.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function esLlamadaAPI(url) {
  // Nunca interceptar Supabase (auth/datos/storage) ni CDNs externos: siempre red.
  return url.hostname.endsWith('supabase.co') ||
         url.hostname.includes('jsdelivr.net') ||
         url.hostname.includes('fonts.googleapis.com') ||
         url.hostname.includes('fonts.gstatic.com');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no cachear POST/PATCH/etc. (mutaciones a Supabase)

  const url = new URL(req.url);
  if (esLlamadaAPI(url)) return; // dejar pasar directo a la red

  // Navegación entre pantallas: red primero, con respaldo en caché y offline.html al final.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('offline.html'))
        )
    );
    return;
  }

  // Assets propios (mismo origen): caché primero, red de respaldo.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        });
      })
    );
  }
});

// Service Worker — Electrodomésticos BM
// Cachea el "app shell" (HTML/CSS/JS propios + íconos) para que la app
// abra al instante y sea instalable. Las llamadas a Supabase (datos en
// vivo) y los scripts de terceros (CDN) NUNCA se sirven desde caché.

// IMPORTANTE: subí este número (y el ?v=N de los <script>/<link> propios
// en index.html y catalogo.html) cada vez que cambie app.js/style.css/etc.
// Los archivos propios se sirven "caché primero" — sin el ?v=N nuevo, el
// navegador puede seguir mostrando la versión vieja aunque ya hayas
// resubido los archivos a Cloudflare.
const CACHE_VERSION = 'bm-app-v9';
const APP_SHELL = [
  'index.html',
  'catalogo.html',
  'style.css?v=9',
  'app.js?v=9',
  'catalogo-publico.js?v=9',
  'config.js?v=9',
  'offline.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'vendor/capacitor/capacitor-core.js?v=9',
  'vendor/capacitor/synapse.js?v=9',
  'vendor/capacitor/bridge-alias.js?v=9',
  'vendor/capacitor/filesystem-plugin.js?v=9',
  'vendor/capacitor/share-plugin.js?v=9'
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

function esRecursoExterno(url) {
  // Nunca interceptar Supabase (auth/datos) ni CDNs externos: siempre red.
  return url.hostname.endsWith('supabase.co') ||
         url.hostname.includes('jsdelivr.net') ||
         url.hostname.includes('cdnjs.cloudflare.com') ||
         url.hostname.includes('fonts.googleapis.com') ||
         url.hostname.includes('fonts.gstatic.com');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no cachear POST/PATCH/etc. (mutaciones a Supabase)

  const url = new URL(req.url);
  if (esRecursoExterno(url)) return; // dejar pasar directo a la red

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

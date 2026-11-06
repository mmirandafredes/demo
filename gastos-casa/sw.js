// Service Worker: guarda la app para usarla sin conexión.
// Cambiá VERSION cada vez que publiques cambios para que los celulares se actualicen.
const VERSION = 'gastos-casa-v1';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/parser.js', 'js/classifier.js', 'js/balances.js', 'js/numbers.js',
  'js/text.js', 'js/format.js', 'js/seed.js', 'js/voice.js', 'js/charts.js', 'js/csv.js',
  'data/comercios-santa-rosa.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la caché (rápido y offline); en segundo plano se actualiza desde la red.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((enCache) => {
        const deRed = fetch(req)
          .then((resp) => { if (resp && resp.ok) cache.put(req, resp.clone()); return resp; })
          .catch(() => (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
        return enCache || deRed;
      })
    )
  );
});

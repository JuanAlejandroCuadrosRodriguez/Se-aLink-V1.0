// Service worker de SeñaLink: permite instalar la app y usarla sin conexión.
// - Código de la app: red primero (para recibir actualizaciones), caché si no hay red.
// - Modelo y WebAssembly de MediaPipe (pesados): caché primero.

const VERSION = 'senalink-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './img/icon.svg',
  './img/icon-192.png',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/session.js',
  './js/camera.js',
  './js/recognizer.js',
  './js/signs.js',
  './js/speech.js',
  './js/ui.js',
  './js/icons.js',
  './js/views/prepare.js',
  './js/views/conversation.js',
  './js/views/reader.js',
  './js/views/finish.js',
  './js/views/admin.js',
  './vendor/mediapipe/vision_bundle.mjs',
];
const HEAVY = /\.(wasm|task)$|vision_wasm_.*\.js$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  if (HEAVY.test(url.pathname) || isFont) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});

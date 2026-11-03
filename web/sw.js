// Red primero (para ver siempre la última versión), caché si no hay conexión.
const C = 'pictos-v16';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'cuaderno.html', 'admin.html', 'seed.js', 'estilo.css', '/fuentes/atkinson-hyperlegible-400-latin.woff2', '/fuentes/atkinson-hyperlegible-700-latin.woff2', '/fuentes/patrick-hand-400-latin.woff2', 'familia.html', 'login.html', 'docente.html', 'cuenta.js', 'pie.js', 'pizarron.js', 'privacidad.html', 'terminos.html', 'manifest.json', 'icono.svg', 'icono-192.png', 'icono-512.png']))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

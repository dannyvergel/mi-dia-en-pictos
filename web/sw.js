// Red primero (para ver siempre la última versión), caché si no hay conexión.
// Pictos de ARASAAC (static.arasaac.org): caché primero, porque no cambian y el Comunicador tiene que responder al instante y sin conexión.
importScripts('comunicador-tablero.js'); // self.TABLERO: el vocabulario del Comunicador (comunicador.html)
const C = 'pictos-v29';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'cuaderno.html', 'admin.html', 'seed.js', 'estilo.css', '/fuentes/atkinson-hyperlegible-400-latin.woff2', '/fuentes/atkinson-hyperlegible-700-latin.woff2', '/fuentes/patrick-hand-400-latin.woff2', 'familia.html', 'login.html', 'docente.html', 'cuenta.js', 'pie.js', 'pizarron.js', 'privacidad.html', 'terminos.html', 'comunicador.html', '/en/comunicador.html', 'comunicador-tablero.js', 'comunicador-textos.js', 'manifest.json', 'icono.svg', 'icono-192.png', 'icono-512.png']))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// El Comunicador pide guardar todos los pictos de su tablero (solo quien lo abre los descarga; ~70 imágenes chicas).
// Si alguno falla (sin red, ARASAAC caído), se sigue con el resto y se reintenta la próxima vez que se abra.
const guardarTablero = () => caches.open(C).then(c => Promise.all(self.TABLERO.urls().map(u => c.match(u).then(ya => ya || c.add(u)).catch(() => {}))));
self.addEventListener('message', e => { if (e.data && e.data.tipo === 'comunicador') e.waitUntil(guardarTablero()); });
// Nunca se cachea /api/ (incluye las descargas de informes y documentos: api/fichas?documento=) ni /descargar/.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /^\/(api|descargar)\//.test(u.pathname)) return;
  if (u.hostname === 'static.arasaac.org') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; })));
    return;
  }
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

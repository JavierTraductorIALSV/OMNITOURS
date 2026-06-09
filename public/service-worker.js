const CACHE_NAME = 'omnitour-v1';
const urlsToCache = [
  '/', '/index.html', '/static/js/bundle.js', '/static/js/main.chunk.js',
  '/static/js/0.chunk.js', '/static/css/main.chunk.css',
  '/Logo-Omnitours.png', '/iaet-logo.png',
  '/Oro.png', '/plata.png', '/Bronce.png', '/Normal.png', '/inaccesibilidad.png'
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache))));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request).catch(() => caches.match(e.request))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))));
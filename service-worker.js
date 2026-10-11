const PREFIX = 'chrome-ai-webmcp-cache-';
const CACHE = `${PREFIX}v2`;
const ASSETS = ['./', './index.html', './styles.css', './app.js', './workspace.js', './storage.js', './manifest.webmanifest', './icon.svg', './icon-192.png'];
const SHELL = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(new URL('./index.html', self.registration.scope))));
  } else if (SHELL.has(url.href)) {
    // Network first prevents an old shell from masking a new deployment while online.
    event.respondWith(fetch(event.request).then(async response => { if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone()); return response; }).catch(async () => { const cached = await (await caches.open(CACHE)).match(event.request); if (cached) return cached; throw new Error('Asset unavailable offline.'); }));
  }
});

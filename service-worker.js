const PREFIX = 'chrome-ai-webmcp-cache-';
const CACHE = `${PREFIX}v9`;
const ASSETS = ['./', './index.html', './styles.css', './app.js', './harness.js', './agent-host.js', './agent-context.js', './request-policy.js', './workspace.js', './storage.js', './manifest.webmanifest', './icon.svg', './icon-192.png'];
const SHELL = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(async () => (await caches.open(CACHE)).match(new URL('./index.html', self.registration.scope))));
  } else if (SHELL.has(url.href)) {
    // Revalidate the HTTP cache too; network-first alone can return fresh-but-old deployment bytes.
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).then(async response => { if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone()); return response; }).catch(async () => { const cached = await (await caches.open(CACHE)).match(event.request); if (cached) return cached; throw new Error('Asset unavailable offline.'); }));
  }
});

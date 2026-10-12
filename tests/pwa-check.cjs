const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let browser, server, deployment = 0;
const deploymentRequests = { app: 0, index: 0 };
(async () => {
  server = http.createServer(async (request, response) => {
    if (request.url === '/fixture') { response.setHeader('Content-Type', 'text/html'); response.end('<title>Cache fixture</title>'); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const deploymentPath = pathname.startsWith('/deployment/');
    if (!pathname.startsWith('/prototype/') && !deploymentPath) { response.writeHead(404); response.end('Missing'); return; }
    const prefix = deploymentPath ? '/deployment/' : '/prototype/';
    const target = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
    if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      let buffer = await fs.readFile(target);
      if (deploymentPath) {
        response.setHeader('Cache-Control', 'public, max-age=3600');
        if (path.basename(target) === 'service-worker.js' && !deployment) buffer = Buffer.from(buffer.toString().replace('`${PREFIX}v6`', '`${PREFIX}v5`').replace("ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))", 'ASSETS').replaceAll("fetch(event.request, { cache: 'no-cache' })", 'fetch(event.request)'));
        if (path.basename(target) === 'app.js') { deploymentRequests.app++; buffer = Buffer.from(`${buffer}\nglobalThis.deploymentMarker = ${JSON.stringify(deployment ? 'new' : 'old')};\n`); }
        if (path.basename(target) === 'index.html') { deploymentRequests.index++; buffer = Buffer.from(buffer.toString().replace('</head>', `<meta name="deployment" content="${deployment ? 'new' : 'old'}"></head>`)); }
      }
      response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); response.end(buffer);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Missing'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(`${origin}/fixture`);
  await page.evaluate(async () => { await caches.open('unrelated-sentinel'); await caches.open('chrome-ai-webmcp-cache-v1'); });
  await page.goto(`${origin}/prototype/`); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cacheNames = await page.evaluate(() => caches.keys()); assert(cacheNames.includes('unrelated-sentinel')); assert(cacheNames.includes('chrome-ai-webmcp-cache-v6')); assert(!cacheNames.includes('chrome-ai-webmcp-cache-v1'));
  const cached = await page.evaluate(async () => (await (await caches.open('chrome-ai-webmcp-cache-v6')).keys()).map(request => request.url)); assert.equal(cached.length, 12); assert(cached.some(url => url.endsWith('/harness.js'))); assert(cached.every(url => url.startsWith(`${origin}/prototype/`)));
  const icon = await page.evaluate(async () => { const response = await fetch('./icon-192.png'); return { ok: response.ok, type: response.headers.get('content-type') }; }); assert.equal(icon.ok, true); assert.match(icon.type, /image\/png/);
  const missing = await page.evaluate(async () => { const response = await fetch('./missing.js'); return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }; }); assert.equal(missing.status, 404); assert.equal(missing.type, 'text/plain'); assert.equal(missing.body, 'Missing');
  await context.setOffline(true); await page.reload(); await page.locator('#startup-title').waitFor(); assert.match(await page.title(), /Local lists/); assert.equal(await page.locator('#workspace').isVisible(), false);
  assert.equal(await page.evaluate(async () => { try { await fetch('./missing.js'); return false; } catch { return true; } }), true);
  assert.equal(await page.evaluate(async () => { const response = await fetch('./workspace.js'); return response.headers.get('content-type'); }), 'text/javascript');
  for (const name of ['agent-host.js', 'agent-context.js']) assert.equal(await page.evaluate(async name => { const response = await fetch('./' + name); const module = await import('./' + name); return response.ok && Object.keys(module).length > 0; }, name), true);
  // A normal deployment update must bypass a still-fresh HTTP cache, not only CacheStorage.
  const deploymentContext = await browser.newContext(), updatePage = await deploymentContext.newPage();
  await updatePage.goto(`${origin}/fixture`); await updatePage.evaluate(() => caches.open('unrelated-deployment-sentinel'));
  await updatePage.goto(`${origin}/deployment/`); await updatePage.evaluate(() => navigator.serviceWorker.ready); await updatePage.reload();
  await updatePage.waitForFunction(() => !!navigator.serviceWorker.controller && globalThis.deploymentMarker === 'old');
  assert.equal(await updatePage.locator('meta[name="deployment"]').getAttribute('content'), 'old');
  assert((await updatePage.evaluate(() => caches.keys())).includes('chrome-ai-webmcp-cache-v5'));
  const oldRequests = { ...deploymentRequests }; deployment = 1;
  await updatePage.evaluate(async () => { globalThis.deploymentActivated = false; navigator.serviceWorker.addEventListener('controllerchange', () => { globalThis.deploymentActivated = true; }, { once: true }); const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await updatePage.waitForFunction(() => globalThis.deploymentActivated);
  await updatePage.evaluate(() => { globalThis.deploymentCacheClean = false; const check = async () => { const keys = await caches.keys(); if (keys.includes('chrome-ai-webmcp-cache-v6') && !keys.includes('chrome-ai-webmcp-cache-v5')) globalThis.deploymentCacheClean = true; else setTimeout(check, 50); }; check(); });
  await updatePage.waitForFunction(() => globalThis.deploymentCacheClean, null, { timeout: 5000 });
  const updatedCaches = await updatePage.evaluate(() => caches.keys()); assert(updatedCaches.includes('chrome-ai-webmcp-cache-v6')); assert(!updatedCaches.includes('chrome-ai-webmcp-cache-v5'));
  assert(await updatePage.evaluate(async () => { const response = await (await caches.open('chrome-ai-webmcp-cache-v6')).match(new URL('./app.js', location.href)); return !!response && (await response.text()).includes('globalThis.deploymentMarker = "new"'); }));
  await updatePage.reload(); await updatePage.waitForFunction(() => globalThis.deploymentMarker === 'new');
  assert.equal(await updatePage.locator('meta[name="deployment"]').getAttribute('content'), 'new');
  assert(deploymentRequests.app > oldRequests.app, 'The updated shell installation must request new app bytes despite max-age');
  assert(deploymentRequests.index > oldRequests.index, 'Navigation must revalidate still-fresh HTTP-cached HTML');
  assert((await updatePage.evaluate(() => caches.keys())).includes('unrelated-deployment-sentinel'));
  await deploymentContext.setOffline(true); await updatePage.reload(); await updatePage.waitForFunction(() => globalThis.deploymentMarker === 'new');
  assert.equal(await updatePage.locator('meta[name="deployment"]').getAttribute('content'), 'new');
  assert.equal(await updatePage.evaluate(async () => (await import('./agent-host.js')).DEFAULT_POLICY.inferences), 24);
  assert.equal(await updatePage.evaluate(async () => { try { await fetch('./missing.js'); return false; } catch { return true; } }), true);
  await browser.close(); await new Promise(resolve => server.close(resolve)); console.log('PWA checks passed: subpath/offline modules, unrelated caches/missing assets, and v5→v6 deployment with max-age=3600 updates both executed/cached JS and navigation HTML on normal reload.');
})().catch(async error => { console.error(error); await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); process.exitCode = 1; });

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let browser, server;
(async () => {
  server = http.createServer(async (request, response) => {
    if (request.url === '/fixture') { response.setHeader('Content-Type', 'text/html'); response.end('<title>Cache fixture</title>'); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/prototype/')) { response.writeHead(404); response.end('Missing'); return; }
    const target = path.resolve(root, decodeURIComponent(pathname.slice('/prototype/'.length)) || 'index.html');
    if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    try { const buffer = await fs.readFile(target); response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); response.end(buffer); } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Missing'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(`${origin}/fixture`);
  await page.evaluate(async () => { await caches.open('unrelated-sentinel'); await caches.open('chrome-ai-webmcp-cache-v1'); });
  await page.goto(`${origin}/prototype/`); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cacheNames = await page.evaluate(() => caches.keys()); assert(cacheNames.includes('unrelated-sentinel')); assert(cacheNames.includes('chrome-ai-webmcp-cache-v4')); assert(!cacheNames.includes('chrome-ai-webmcp-cache-v1'));
  const cached = await page.evaluate(async () => (await (await caches.open('chrome-ai-webmcp-cache-v4')).keys()).map(request => request.url)); assert.equal(cached.length, 10); assert(cached.some(url => url.endsWith('/harness.js'))); assert(cached.every(url => url.startsWith(`${origin}/prototype/`)));
  const icon = await page.evaluate(async () => { const response = await fetch('./icon-192.png'); return { ok: response.ok, type: response.headers.get('content-type') }; }); assert.equal(icon.ok, true); assert.match(icon.type, /image\/png/);
  const missing = await page.evaluate(async () => { const response = await fetch('./missing.js'); return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }; }); assert.equal(missing.status, 404); assert.equal(missing.type, 'text/plain'); assert.equal(missing.body, 'Missing');
  await context.setOffline(true); await page.reload(); await page.locator('#startup-title').waitFor(); assert.match(await page.title(), /Local lists/); assert.equal(await page.locator('#workspace').isVisible(), false);
  assert.equal(await page.evaluate(async () => { try { await fetch('./missing.js'); return false; } catch { return true; } }), true);
  assert.equal(await page.evaluate(async () => { const response = await fetch('./workspace.js'); return response.headers.get('content-type'); }), 'text/javascript');
  await browser.close(); await new Promise(resolve => server.close(resolve)); console.log('PWA checks passed: real subpath scope/assets, unrelated cache preservation, old app cache cleanup, correct icon/module types, navigation offline fallback and no HTML asset fallback.');
})().catch(async error => { console.error(error); await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); process.exitCode = 1; });

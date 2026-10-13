const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configure = require('./harness-ui.cjs');
let browser;
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); }
async function items(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const result = await read(db, 'items'); db.close(); return result; }); }
async function enqueue(page, native, groups) { await page.evaluate(({ native, groups }) => { for (const [index, titles] of groups.entries()) fixture.responses.push(native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: `dump-${index}-${crypto.randomUUID()}`, name: 'capture_tasks', arguments: { titles } }) }] : { message: '', tool: { name: 'capture_tasks', arguments: { titles } } }); if (native) fixture.responses.push([{ type: 'text', value: 'Acknowledged.' }]); }, { native, groups }); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const original = ['Compare car insurance', 'Book a test drive', 'Renew my passport', 'Chase kitchen quote', 'Research options for a new car', 'Sketch a reading nook layout'];
  for (const native of [false, true]) for (const titles of [original, ['Find hiking boots', 'Plan a picnic']]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, { nativeToolUse: native }); const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8767'); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configure(page);
    const request = `Here is my mind dump. Capture these exact titles: ${titles.map(title => JSON.stringify(title)).join(', ')}.`;
    await enqueue(page, native, [titles]); await send(page, request); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.deepEqual((await items(page)).map(item => item.title).sort(), [...titles].sort()); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 2 : 1); assert.doesNotMatch(await page.locator('#chat').innerText(), /repeated proposal|Request failed/);
    await page.evaluate(() => { fixture.prompts = []; }); await enqueue(page, native, [titles]); await send(page, request); await idle(page);
    assert.equal((await items(page)).length, titles.length); assert.equal(await page.evaluate(() => fixture.executions.length), 2); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 2 : 1); assert.match(await page.locator('#chat').innerText(), /already/); assert.doesNotMatch(await page.locator('#chat').innerText(), /repeated proposal|Request failed/);
    await page.evaluate(() => { fixture.prompts = []; }); const distinct = [['Read the trail map'], ['Check the weather']]; await enqueue(page, native, distinct); await send(page, 'Here is my mind dump. Capture exact title: "Read the trail map" and capture exact title: "Check the weather".'); await idle(page);
    assert.equal((await items(page)).length, titles.length + 2); assert.equal(await page.evaluate(() => fixture.executions.length), 4); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 4 : 2); assert.doesNotMatch(await page.locator('#chat').innerText(), /repeated proposal|Request failed/);
    // Completed mind-dump narration is context, not another capture request.
    await page.locator('#review-button').click(); await page.getByRole('button', { name: 'Start review', exact: true }).click(); await idle(page);
    for (let index = 0; index < 2; index++) { await page.getByRole('button', { name: 'Complete step', exact: true }).click(); await idle(page); }
    const before = await items(page);
    await page.evaluate(native => { fixture.responses = [native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: 'narrated-review', name: 'weekly_review', arguments: { action: 'complete_step' } }) }] : { message: '', tool: { name: 'weekly_review', arguments: { action: 'complete_step' } } }]; if (native) fixture.responses.push([{ type: 'text', value: 'Acknowledged.' }]); fixture.prompts = []; fixture.executions = []; }, native);
    await send(page, 'My mind dump is captured and organized. Complete the current Empty your head review step.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.deepEqual(await items(page), before); assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['weekly_review']); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 2 : 1); assert.match(await page.locator('#review-card').innerText(), /4 \/ 11/); assert.doesNotMatch(await page.locator('#chat').innerText(), /repeated proposal|Request failed/);
    await context.close();
  }
  await browser.close(); console.log('Mind dump routing passed: empty introduction joins one real capture in both adapters, exact six/alternate titles save once, repeat is one verified no-op, and distinct capture clauses remain distinct.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

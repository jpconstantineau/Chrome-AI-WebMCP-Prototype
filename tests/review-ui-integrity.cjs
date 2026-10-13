// A cached review card must not overwrite progress committed by another tab.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
const URL = process.env.APP_URL || 'http://127.0.0.1:8765';
let browser;
async function savedReview(page) {
  return page.evaluate(async () => {
    const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
    try { return await read(db, 'reviews', 'weekly'); } finally { db.close(); }
  });
}
async function ready(page) {
  await require('./startup-ui.cjs')(page);
  await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
}
async function idle(page) { await require('./finish-turn.cjs')(page); }
async function guidanceHasNoProgressTool(page, native) {
  assert.equal(await page.evaluate(() => fixture.prompts.length), 0, 'Trusted weekly guidance requires no model/tool inference');
  assert.equal(await page.evaluate(() => fixture.executions.length), 0);
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const options of [{}, { nativeToolUse: true, idKey: 'callId' }]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options);
    const page = await context.newPage(); await page.goto(URL); await ready(page);
    await page.getByRole('button', { name: 'Weekly review', exact: true }).click();
    await page.getByRole('button', { name: 'Start review', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#review-card').textContent.includes('1 / 11')); await idle(page);
    await guidanceHasNoProgressTool(page, !!options.nativeToolUse);
    assert.equal((await savedReview(page)).index, 0);
    const newer = await page.evaluate(async () => {
      const { openDatabase, read, transitionReview } = await import('./storage.js'); const db = await openDatabase(() => {});
      try {
        for (let step = 0; step < 2; step++) {
          const current = await read(db, 'reviews', 'weekly');
          await transitionReview(db, 'complete_step', JSON.stringify(current));
        }
        return await read(db, 'reviews', 'weekly');
      } finally { db.close(); }
    });
    assert.equal(newer.index, 2); assert.deepEqual(newer.completed, ['collect', 'inbox-zero']);
    assert.match(await page.locator('#review-card').innerText(), /1 \/ 11/, 'The original UI deliberately retains its stale cached card');
    await page.getByRole('button', { name: 'Complete step', exact: true }).click();
    await page.getByText('Review progress changed. Review and approve the action again.', { exact: true }).waitFor();
    assert.deepEqual(await savedReview(page), newer, 'Stale UI completion must not erase the two newer completed marks');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.deepEqual(await savedReview(page), newer, 'Stale UI pause must not overwrite current progress either');
    await page.reload(); await ready(page);
    const restored = await savedReview(page);
    assert.equal(restored.index, 2); assert.deepEqual(restored.completed, newer.completed); assert.equal(restored.active, false);
    assert.equal(await page.evaluate(() => fixture.prompts.length), 0, 'Reload pauses without replaying model work');
    await page.getByRole('button', { name: 'Resume review', exact: true }).click(); await idle(page);
    await guidanceHasNoProgressTool(page, !!options.nativeToolUse);
    await page.getByRole('button', { name: 'Complete step', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#review-card').textContent.includes('4 / 11')); await idle(page);
    const resumed = await savedReview(page);
    assert.equal(resumed.index, 3); assert.deepEqual(resumed.completed, ['collect', 'inbox-zero', 'head']);
    await context.close();
  }
  await browser.close();
  console.log('Review UI integrity passed: stale completion/pause preserve newer marks, reload resumes correct progress, and automatic guidance omits review controls.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

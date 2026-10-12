const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
const mutations = ['capture_tasks', 'organize_tasks', 'complete_task', 'set_task_status', 'add_shopping_item', 'create_item', 'update_item', 'delete_item', 'update_attribute', 'set_parent', 'weekly_review'];
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function items(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return await read(db, 'items'); } finally { db.close(); } }); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const native of [false, true]) for (const full of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, native ? { nativeToolUse: true } : {});
    const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765'); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page, { native, full });
    await page.evaluate(() => { window.external = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'list_attributes'), {})); });
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await page.evaluate(() => external);
    await page.evaluate(() => {
      fixture.executions = []; fixture.prompts = [];
      fixture.call = (id, name, args) => fixture.options.nativeToolUse ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: id, name, arguments: args }) }] : { message: '', tool: { name, arguments: args } };
      fixture.responses.push(fixture.call('start-attack', 'add_shopping_item', { title: 'Review upcoming calendar', listTitle: 'Shopping List' }));
    });
    await page.locator('#review-button').click(); await page.getByRole('button', { name: 'Start review', exact: true }).click(); await page.waitForFunction(() => fixture.prompts.length > 0); await idle(page);
    async function assertGuidance() {
      const names = await page.evaluate(native => native ? fixture.modelSettings.at(-1).tools.map(tool => tool.name) : fixture.prompts.findLast(prompt => prompt.stage === 'route').input.tools.map(tool => tool.name), native);
      assert(names.includes('list_items')); assert(names.includes('show_view')); for (const name of mutations) assert.equal(names.includes(name), false, `${name} must be absent from trusted generated guidance`);
      assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal(await page.locator('#approval').isVisible(), false); assert.equal((await items(page)).length, 0);
    }
    await assertGuidance();
    // Native contract rejection correctly expires opt-in; reacquire it via the production canary.
    if (native) await configureHarness(page, { native, full });
    await page.evaluate(() => { fixture.prompts = []; fixture.executions = []; fixture.responses = [fixture.call('complete-attack', 'capture_tasks', { titles: ['Unrequested guidance capture'] })]; });
    await page.getByRole('button', { name: 'Complete step', exact: true }).click(); await page.waitForFunction(() => fixture.prompts.length > 0); await idle(page); await assertGuidance();
    if (native) await configureHarness(page, { native, full });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.evaluate(() => { fixture.prompts = []; fixture.executions = []; fixture.responses = [fixture.call('resume-attack', 'weekly_review', { action: 'complete_step' })]; });
    await page.getByRole('button', { name: 'Resume review', exact: true }).click(); await page.waitForFunction(() => fixture.prompts.length > 0); await idle(page); await assertGuidance();
    assert.match(await page.locator('#review-card').innerText(), /2 \/ 11/);
    if (native) await configureHarness(page, { native, full });
    await page.evaluate(() => { fixture.executions = []; fixture.prompts = []; fixture.responses = [fixture.call('human-write', 'create_item', { title: 'Fresh human instruction' }), fixture.options.nativeToolUse ? [{ type: 'text', value: 'Finished.' }] : { message: 'Finished.', tool: null }]; });
    await page.locator('#message').fill('Create Fresh human instruction.'); await page.locator('#send').click(); await idle(page);
    assert.deepEqual((await items(page)).map(item => item.title), ['Fresh human instruction']); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.locator('#approval').isVisible(), false);
    await context.close();
  }
  await browser.close(); console.log('Harness v2 guidance passed: UI start/complete/resume expose only reads+show_view across Standard/Full bridge/native; a prior chat grant cannot dispatch writes/review controls, while fresh human writes remain available.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

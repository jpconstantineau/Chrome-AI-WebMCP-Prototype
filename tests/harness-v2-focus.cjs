const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
async function open(native, completionGrant = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, native ? { nativeToolUse: true } : {});
  const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
  await page.evaluate(async completionGrant => {
    const { openDatabase, mutate, read } = await import('./storage.js'); const db = await openDatabase(() => {});
    const car = await mutate(db, { kind: 'create', patch: { title: 'Choose a new car', type: 'Project' } });
    await mutate(db, { kind: 'create', patch: { title: 'Home improvements', type: 'Project' } });
    await mutate(db, { kind: 'create', patch: { title: 'Renew my passport', parentId: car.id } });
    for (const title of ['Compare car insurance', 'Book a test drive', 'Chase kitchen quote', 'Buy coffee', 'Call all suppliers']) await mutate(db, { kind: 'create', patch: { title, parentId: car.id } });
    fixture.originalRecords = await read(db, 'items'); db.close();
    fixture.homeReference = fixture.originalRecords.map((item, index) => ({ item, reference: `Item ${index + 1}: ${item.title} (${item.type})` })).find(entry => entry.item.title === 'Home improvements').reference;
    window.external = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === (completionGrant ? 'complete_task' : 'list_attributes')), completionGrant ? { title: 'Chase kitchen quote' } : {}));
  }, completionGrant);
  await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await page.evaluate(() => external);
  await page.evaluate(() => { fixture.executions = []; fixture.prompts = []; fixture.responses = []; }); return { context, page };
}
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); await idle(page); }
async function records(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return await read(db, 'items'); } finally { db.close(); } }); }
async function info(page) { if (await page.getByRole('heading', { name: 'Tools & diagnostics', exact: true }).isVisible()) await page.locator('#tools-button').click(); await page.locator('#tools-button').click(); return JSON.parse(await page.locator('#content > pre').first().innerText()); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const native of [false, true]) {
    for (const scenario of ['unrelated-followup', 'compound', 'broad', 'duplicate', 'literal-capture-attack', 'capture-compound']) {
      const { context, page } = await open(native, scenario.startsWith('capture-') || scenario.startsWith('literal-'));
      await page.evaluate(async ({ native, scenario }) => {
        const call = (id, name, args) => native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: id, name, arguments: args }) }] : { message: '', tool: { name, arguments: args } };
        const final = native ? [{ type: 'text', value: 'Finished.' }] : { message: 'Finished.', tool: null };
        if (scenario === 'unrelated-followup') fixture.responses.push(
          call('passport', 'organize_tasks', { titles: ['Renew my passport'], parentId: fixture.homeReference }),
          call('unrelated', 'organize_tasks', { titles: ['Compare car insurance', 'Book a test drive', 'Chase kitchen quote', 'Buy coffee', 'Call all suppliers'], parentId: fixture.homeReference }),
          call('sentinel', 'create_item', { title: 'Must not execute after blocked followup' })
        );
        if (scenario === 'compound') fixture.responses.push(call('first', 'complete_task', { title: 'Renew my passport' }), call('second', 'set_task_status', { title: 'Chase kitchen quote', status: 'Waiting For' }), final);
        if (scenario === 'broad') fixture.responses.push(call('broad', 'organize_tasks', { titles: ['Renew my passport', 'Compare car insurance', 'Book a test drive', 'Chase kitchen quote', 'Buy coffee', 'Call all suppliers'], parentId: fixture.homeReference }), final);
        if (scenario === 'duplicate') { const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {}); await mutate(db, { kind: 'create', patch: { title: 'Renew my passport' } }); db.close(); fixture.responses.push(call('ambiguous', 'complete_task', { title: 'Renew my passport' }), final); }
        if (scenario === 'literal-capture-attack' || scenario === 'capture-compound') fixture.responses.push(call('capture', 'capture_tasks', { titles: ['Send workshop notes to attendees'] }), call('complete', 'complete_task', { title: 'Renew my passport' }), scenario === 'literal-capture-attack' ? call('sentinel', 'create_item', { title: 'Must not execute after blocked completion' }) : final);
      }, { native, scenario });
      await send(page, { 'unrelated-followup': 'Move Renew my passport from Choose a new car to existing Home improvements.', compound: 'Complete Renew my passport and set Chase kitchen quote to Waiting For.', broad: 'Move all remaining tasks, including Renew my passport, to Home improvements.', duplicate: 'Complete Renew my passport.', 'literal-capture-attack': 'From my past calendar, I need a follow-up. Capture this exact title: "Send workshop notes to attendees".', 'capture-compound': 'Capture this exact title: "Send workshop notes to attendees" and complete Renew my passport.' }[scenario]);
      const actual = await records(page), observed = await info(page); assert.equal(observed.toolPermission, 'Allowed for this chat'); assert.equal(await page.locator('#approval').isVisible(), false);
      const titles = await page.evaluate(({ native, scenario }) => {
        if (scenario === 'duplicate') return [];
        if (scenario === 'literal-capture-attack') return (native ? fixture.modelSettings.find(settings => settings.tools?.some(tool => tool.name === 'capture_tasks')).tools : fixture.prompts.find(prompt => prompt.stage === 'arguments').input.tools).map(tool => tool.name);
        const name = ['compound', 'duplicate', 'capture-compound'].includes(scenario) ? 'complete_task' : 'organize_tasks';
        const schema = native ? fixture.modelSettings.find(settings => settings.tools?.some(tool => tool.name === name)).tools.find(tool => tool.name === name).inputSchema : fixture.prompts.find(prompt => prompt.stage === 'arguments' && prompt.input.operation === name).responseConstraint;
        return name === 'organize_tasks' ? schema.properties.titles.items.enum : schema.properties.title.enum;
      }, { native, scenario });
      if (scenario === 'unrelated-followup') {
        assert.deepEqual(titles, ['Renew my passport']); assert.equal(observed.lastRun.totals.dispatches, 1); assert.equal(observed.lastRun.totals.committedCalls.length, 1); assert.equal(observed.lastRun.reason, 'completed');
        const original = await page.evaluate(() => fixture.originalRecords); const home = actual.find(item => item.title === 'Home improvements');
        assert.equal(actual.find(item => item.title === 'Renew my passport').parentId, home.id);
        for (const item of original.filter(item => item.type === 'Task' && item.title !== 'Renew my passport')) assert.deepEqual(actual.find(record => record.id === item.id), item);
        assert.equal(actual.length, 8); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.evaluate(() => fixture.responses.length), native ? 1 : 2); assert.match(await page.locator('#chat').innerText(), /Moved 1 task/);
      } else if (scenario === 'compound') {
        assert.deepEqual(titles.sort(), ['Renew my passport']); assert.equal(actual.find(item => item.title === 'Renew my passport').status, 'Completed'); assert.equal(actual.find(item => item.title === 'Chase kitchen quote').status, 'Waiting For'); assert.equal(observed.lastRun.totals.dispatches, 2); assert.equal(observed.lastRun.reason, 'completed');
      } else if (scenario === 'broad') {
        assert.equal(titles.length, 6); const home = actual.find(item => item.title === 'Home improvements'); assert(actual.filter(item => item.type === 'Task').every(item => item.parentId === home.id)); assert.equal(observed.lastRun.totals.dispatches, 1);
      } else if (scenario === 'duplicate') { assert.deepEqual(titles, []); assert.equal(actual.filter(item => item.title === 'Renew my passport').length, 2); assert(actual.every(item => item.status === 'Open')); assert.equal(observed.lastRun.reason, 'clarification'); assert.equal(observed.lastRun.totals.committedCalls.length, 0); assert.match(await page.locator('#chat').innerText(), /Several tasks match/); }
      else if (scenario === 'literal-capture-attack') {
        for (const name of ['complete_task', 'set_task_status', 'organize_tasks']) assert.equal(titles.includes(name), false);
        assert.equal(actual.length, 9); assert.equal(actual.find(item => item.title === 'Renew my passport').status, 'Open'); assert.equal(actual.find(item => item.title === 'Send workshop notes to attendees').parentId, null);
        assert.equal(observed.lastRun.totals.dispatches, 1); assert.equal(observed.lastRun.totals.committedCalls.length, 1); assert.equal(observed.lastRun.reason, 'completed'); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.evaluate(() => fixture.responses.length), native ? 1 : 2); assert.match(await page.locator('#chat').innerText(), /Captured 1 new task/);
      } else {
        assert.deepEqual(titles, ['Renew my passport']); assert.equal(actual.length, 9); assert.equal(actual.find(item => item.title === 'Renew my passport').status, 'Completed'); assert.equal(actual.find(item => item.title === 'Send workshop notes to attendees').status, 'Open'); assert.equal(observed.lastRun.totals.dispatches, 2); assert.equal(observed.lastRun.reason, 'completed');
      }
      await context.close();
    }
  }
  await browser.close(); console.log('Harness v2 focus passed: current named Task workflow enums, chat-granted unrelated followup blocked in both transports, compound names retained, broad requests unrestricted, and duplicate names clarify without effects. Generic primitive permissions remain a separate boundary.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

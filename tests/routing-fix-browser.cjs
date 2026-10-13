const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configure = require('./harness-ui.cjs');
let browser;
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); await idle(page); }
async function facts(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items; }); }
async function call(page, native, name, arguments_) {
  await page.evaluate(({ native, name, arguments_ }) => { fixture.responses.push(native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: crypto.randomUUID(), name, arguments: arguments_ }) }] : { message: '', tool: { name, arguments: arguments_ } }); if (native) fixture.responses.push([{ type: 'text', value: 'Acknowledged.' }]); }, { native, name, arguments_ });
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const native of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, { nativeToolUse: native });
    const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8767'); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configure(page);
    await page.evaluate(async () => { const { openDatabase, mutate, read } = await import('./storage.js'); const db = await openDatabase(() => {}); for (const patch of [{ title: 'Paint hall', context: '@Initial' }, { title: 'Call painter', status: 'Waiting For' }, { title: 'Home', type: 'Project' }, { title: 'Home improvements', type: 'Project' }]) await mutate(db, { kind: 'create', patch }); fixture.seed = await read(db, 'items'); db.close(); window.grant = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'list_attributes'), {})); });
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await page.evaluate(() => grant); await page.evaluate(() => { fixture.executions = []; });
    let ref = await page.evaluate(() => ['Paint hall', 'Call painter', 'Home', 'Home improvements'].map(title => { const index = fixture.seed.findIndex(item => item.title === title); const item = fixture.seed[index]; return `Item ${index + 1}: ${item.title} (${item.type})`; }));
    for (const value of ['@Someday/Maybe', '  @Home / @Work  ', 'complete current review step', '', 'remove context']) {
      await call(page, native, 'update_item', { id: ref[0], patch: { context: value } });
      await send(page, `Set the context of Paint hall to ${JSON.stringify(value)}. Preserve its title, parent and Open status.`);
      const actual = await facts(page); assert.equal(actual.find(item => item.title === 'Paint hall').context, value); assert.equal(actual.find(item => item.title === 'Paint hall').status, 'Open');
    }
    for (const wrong of [{ id: ref[0], patch: { context: 'Someday/Maybe' } }, { id: ref[0], patch: { context: '@Someday/Maybe', status: 'Completed' } }]) {
      const before = await facts(page), count = await page.evaluate(() => fixture.executions.length); await call(page, native, 'update_item', wrong); await send(page, 'Set Paint hall context to "@Someday/Maybe".'); assert.deepEqual(await facts(page), before); assert.equal(await page.evaluate(() => fixture.executions.length), count); await page.evaluate(() => { fixture.responses = []; }); if (native) await configure(page, { native: true, resetTrace: false });
    }
    { const before = await facts(page), count = await page.evaluate(() => fixture.executions.length); await call(page, native, 'organize_tasks', { titles: ['Paint hall', 'Paint hall'], parentId: ref[3] }); await send(page, 'Move Paint hall and Call painter to Home improvements.'); assert.deepEqual(await facts(page), before); assert.equal(await page.evaluate(() => fixture.executions.length), count); await page.evaluate(() => { fixture.responses = []; }); if (native) await configure(page, { native: true, resetTrace: false }); }
    const count = await page.evaluate(() => fixture.executions.length);
    await send(page, 'Move Paint hall to a Project. Ask which before changing it.'); assert.equal(await page.evaluate(() => fixture.executions.length), count); assert.match(await page.locator('#chat').innerText(), /Home improvements/);
    await call(page, native, 'organize_tasks', { titles: ['Paint hall'], parentId: ref[3] }); await send(page, 'Use Home improvements'); assert.equal((await facts(page)).find(item => item.title === 'Paint hall').parentId, (await facts(page)).find(item => item.title === 'Home improvements').id);
    await send(page, 'No tools: which Project should Paint hall belong in?'); const before = await facts(page); await call(page, native, 'organize_tasks', { titles: ['Paint hall'], parentId: ref[2] }); await send(page, 'Use Home'); assert.deepEqual(await facts(page), before); await page.evaluate(() => { fixture.responses = []; });
    if (native) await configure(page, { native: true, resetTrace: false });
    // Independent fields on one task use only revisions proven by this run's receipts.
    await page.evaluate(({ native, ref }) => { const make = (id, name, args) => native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: id, name, arguments: args }) }] : { message: '', tool: { name, arguments: args } }; fixture.responses.push(make('context', 'update_item', { id: ref, patch: { context: '@Home / planning' } }), make('status', 'set_task_status', { title: 'Paint hall', status: 'In Progress' })); if (native) fixture.responses.push([{ type: 'text', value: 'Acknowledged.' }]); }, { native, ref: ref[0] });
    await send(page, 'Set Paint hall context to "@Home / planning" and set Paint hall to In Progress.'); const compound = await facts(page); assert.equal(compound.find(item => item.title === 'Paint hall').context, '@Home / planning'); assert.equal(compound.find(item => item.title === 'Paint hall').status, 'In Progress');
    // A successful one-effect request never consumes another proposed write.
    await page.evaluate(({ native }) => { const make = (id, name, args) => native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: id, name, arguments: args }) }] : { message: '', tool: { name, arguments: args } }; fixture.responses.push(make('capture', 'capture_tasks', { titles: ['Plan weekend walk'] }), make('attack', 'complete_task', { title: 'Call painter' })); }, { native });
    await send(page, 'Capture this exact title: "Plan weekend walk".'); assert.equal((await facts(page)).find(item => item.title === 'Call painter').status, 'Waiting For'); assert.equal((await facts(page)).filter(item => item.title === 'Plan weekend walk').length, 1);
    await context.close();
  }
  await browser.close(); console.log('Routing fixes passed in bridge/native: exact contexts, wrong-field attacks, grounded answer, no-tools boundary, committed same-task compound revisions and finite effects under chat grants.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

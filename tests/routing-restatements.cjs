const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configure = require('./harness-ui.cjs');
let browser;
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function facts(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items; }); }
async function command(page, native, text, calls) {
  await page.evaluate(({ native, calls }) => { fixture.responses = calls.map(({ name, args }) => native ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: crypto.randomUUID(), name, arguments: args }) }] : { message: '', tool: { name, arguments: args } }); if (native) fixture.responses.push([{ type: 'text', value: 'Acknowledged.' }]); fixture.prompts = []; fixture.executions = []; }, { native, calls });
  await page.locator('#message').fill(text); await page.locator('#send').click(); await idle(page);
  assert.doesNotMatch(await page.locator('#status').innerText(), /Request failed|repeated/);
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const native of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, { nativeToolUse: native }); const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8767'); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configure(page);
    await page.evaluate(async () => { const { openDatabase, mutate, read } = await import('./storage.js'); const db = await openDatabase(() => {}); for (const title of ['Chase kitchen quote', 'Call the roofer', 'Renew my passport', 'Inspect new Project named Car']) await mutate(db, { kind: 'create', patch: { title, context: '@Initial' } }); for (const title of ['Choose a new car', 'Start a new studio', 'Build a new Project named Car']) await mutate(db, { kind: 'create', patch: { title, type: 'Project' } }); fixture.seed = await read(db, 'items'); db.close(); window.grant = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'list_attributes'), {})); }); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await page.evaluate(() => grant);
    for (const title of ['Chase kitchen quote', 'Call the roofer']) {
      for (const repeat of [false, true]) {
        await command(page, native, `I am waiting for ${title}. Set that task to Waiting For.`, [{ name: 'set_task_status', args: { title, status: 'Waiting For' } }]);
        assert.equal((await facts(page)).find(item => item.title === title).status, 'Waiting For'); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 2 : 1); assert.doesNotMatch(await page.locator('#chat').innerText(), /repeated proposal/);
      }
      await command(page, native, `I completed ${title}. Mark that existing task complete.`, [{ name: 'complete_task', args: { title } }]); assert.equal((await facts(page)).find(item => item.title === title).status, 'Completed'); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(await page.evaluate(() => fixture.prompts.length), native ? 2 : 1);
    }
    const reference = title => page.evaluate(title => { const index = fixture.seed.findIndex(item => item.title === title); const item = fixture.seed[index]; return `Item ${index + 1}: ${item.title} (${item.type})`; }, title);
    const roofer = await reference('Call the roofer');
    await command(page, native, 'I am waiting for Call the roofer. Set its context to "  @Roof / planning  ".', [{ name: 'set_task_status', args: { title: 'Call the roofer', status: 'Waiting For' } }, { name: 'update_item', args: { id: roofer, patch: { context: '  @Roof / planning  ' } } }]); assert.equal((await facts(page)).find(item => item.title === 'Call the roofer').context, '  @Roof / planning  '); assert.equal(await page.evaluate(() => fixture.executions.length), 2);
    for (const destination of ['Choose a new car', 'Start a new studio', 'Build a new Project named Car']) {
      const parentId = await reference(destination); await command(page, native, `Move Renew my passport to the existing ${destination} Project.`, [{ name: 'organize_tasks', args: { titles: ['Renew my passport'], parentId } }]); const records = await facts(page); assert.equal(records.find(item => item.title === 'Renew my passport').parentId, records.find(item => item.title === destination).id); assert.equal(records.filter(item => item.type === 'Project').length, 3); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
      const schema = await page.evaluate(native => native ? fixture.modelSettings.at(-1).tools[0].inputSchema : fixture.prompts[0].responseConstraint, native); assert(Object.hasOwn(schema.properties, 'parentId')); assert.equal(Object.hasOwn(schema.properties, 'newProjectTitle'), false);
    }
    await command(page, native, 'Move "Inspect new Project named Car" to existing Choose a new car.', [{ name: 'organize_tasks', args: { titles: ['Inspect new Project named Car'], parentId: await reference('Choose a new car') } }]); assert.equal((await facts(page)).filter(item => item.type === 'Project').length, 3);
    await command(page, native, 'Move Renew my passport under a new Buy new car project.', [{ name: 'organize_tasks', args: { titles: ['Renew my passport'], newProjectTitle: 'Buy new car' } }]); assert.equal((await facts(page)).filter(item => item.title === 'Buy new car' && item.type === 'Project').length, 1); assert.equal((await facts(page)).filter(item => item.type === 'Project').length, 4);
    await command(page, native, 'Move Renew my passport under a new Project named "Travel preparation".', [{ name: 'organize_tasks', args: { titles: ['Renew my passport'], newProjectTitle: 'Travel preparation' } }]); assert.equal((await facts(page)).filter(item => item.title === 'Travel preparation' && item.type === 'Project').length, 1);
    const before = await facts(page); await command(page, native, 'Complete Chase kitchen quote. Keep Call the roofer waiting. Move it to Choose a new car.', []); assert.deepEqual(await facts(page), before); assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal(await page.evaluate(() => fixture.prompts.length), 0);
    await context.close();
  }
  await browser.close(); console.log('Restatement/destination routing passed: immediate current-turn status/completion restatements execute once, pronoun independent fields retain scope, intervening clauses clarify, existing new-containing/marker-containing Project names stay existing, and explicit new Projects remain new in both adapters.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

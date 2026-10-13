const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configure = require('./harness-ui.cjs');
let browser;
const origin = process.env.APP_URL || 'http://127.0.0.1:8767';
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#workspace').hidden || [...document.querySelectorAll('#startup-actions button')].some(button => button.textContent === 'Continue'));
  if (await page.locator('#startup').isVisible()) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}
async function open(options = {}, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport });
  await context.addInitScript(fixture, options);
  const page = await context.newPage(); await page.goto(origin); await ready(page);
  return { context, page };
}
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function data(page) {
  return page.evaluate(async () => {
    const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
    try { return { items: await read(db, 'items'), settings: await read(db, 'preferences', 'settings') }; }
    finally { db.close(); }
  });
}
async function startExternal(page, name, args) {
  await page.evaluate(({ name, args }) => {
    window.pendingExternal = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === name), args));
  }, { name, args });
}
async function externalResult(page) {
  return page.evaluate(async () => { const result = await pendingExternal; return typeof result === 'string' ? JSON.parse(result) : result; });
}
async function approve(page, name = 'Allow once') { await page.getByRole('button', { name, exact: true }).click(); }
async function info(page) {
  if (!(await page.getByRole('heading', { name: 'Tools & diagnostics', exact: true }).isVisible())) await page.locator('#tools-button').click();
  return JSON.parse(await page.locator('#content > pre').first().innerText());
}
async function seedQuestions(page) {
  await page.evaluate(async () => {
    const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
    await mutate(db, { kind: 'create', patch: { title: 'Inspect boiler', context: '@Initial' } });
    await mutate(db, { kind: 'create', patch: { title: 'Sentinel task', context: '@Untouched' } }); db.close();
  });
  await page.reload(); await ready(page);
}
async function grantChat(page) {
  await startExternal(page, 'list_attributes', {}); await approve(page, 'Allow for this chat'); assert.equal((await externalResult(page)).ok, true);
  await page.evaluate(() => { fixture.executions = []; fixture.prompts = []; fixture.responses = []; });
}
async function enqueue(page, native, entries) {
  await page.evaluate(({ native, entries }) => {
    fixture.responses = entries.map(entry => native
      ? entry.tool ? [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: crypto.randomUUID(), name: entry.tool.name, arguments: entry.tool.arguments }) }] : [{ type: 'text', value: entry.message }]
      : entry);
    fixture.prompts = []; fixture.executions = [];
  }, { native, entries });
}
const tool = (name, args) => ({ message: '', tool: { name, arguments: args } });
const reply = message => ({ message, tool: null });
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#message').press('Enter'); }

async function layoutAndNavigation() {
  const { context, page } = await open();
  for (const width of [851, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const measured = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return { total: box('.layout').width, nav: box('#navigation').width, agent: box('#assistant').width, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(Math.abs(measured.nav / measured.total - .125) < .001, `${width}px navigation is 12.5%`);
    assert(Math.abs(measured.agent / measured.total - .15) < .001, `${width}px agent is 15%`);
    assert.equal(measured.overflow, false);
  }
  const groups = await page.locator('#navigation > ul > li.navgroup > .navrow > .select').allTextContents();
  assert.equal(groups[0], 'Inbox'); assert.equal(groups[1], 'All items'); assert.equal(groups.at(-1), 'Checklists');
  await page.locator('#navigation').getByRole('button', { name: 'All items', exact: true }).click();
  await page.locator('#filter-search').fill('inspection'); await page.locator('#filter-context').fill('@Home'); await page.locator('#filter-status').selectOption('Waiting For');
  await page.locator('#tools-button').click(); await page.getByRole('heading', { name: 'Tools & diagnostics', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  assert.equal(await page.locator('#filter-search').inputValue(), 'inspection'); assert.equal(await page.locator('#filter-context').inputValue(), '@Home'); assert.equal(await page.locator('#filter-status').inputValue(), 'Waiting For');
  await page.locator('#tools-button').click(); await page.getByRole('heading', { name: 'Tools & diagnostics', exact: true }).waitFor(); await page.locator('#tools-button').click();
  assert.equal(await page.locator('#filter-search').inputValue(), 'inspection'); assert.equal(await page.locator('#navigation [aria-current="page"]').innerText(), 'All items');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, shown, hidden] of [['Lists', '#navigation', '#content'], ['Assistant', '#assistant', '#navigation'], ['Content', '#content', '#assistant']]) {
    await page.locator('.mobile-tabs').getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator(shown).isVisible(), true); assert.equal(await page.locator(hidden).isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await context.close();
}
async function rememberedPermissionsAndStorage() {
  const { context, page } = await open();
  assert.equal((await info(page)).diagnostics.IndexedDB.action, 'created');
  await page.setViewportSize({ width: 851, height: 900 });
  await startExternal(page, 'create_item', { title: 'Remembered first item' }); await page.locator('#approval').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Narrow desktop permission controls fit');
  await approve(page, 'Always allow create_item'); assert.equal((await externalResult(page)).ok, true);
  assert.deepEqual((await data(page)).settings.allowedTools, ['create_item']);
  await page.reload(); await ready(page); assert.equal((await info(page)).diagnostics.IndexedDB.action, 'opened-existing');
  await startExternal(page, 'create_item', { title: 'Remembered after reload' }); assert.equal((await externalResult(page)).ok, true); assert.equal(await page.locator('#approval').isVisible(), false);
  await page.locator('#new-chat').click(); await page.getByRole('button', { name: 'Start new chat', exact: true }).click(); await idle(page);
  await startExternal(page, 'create_item', { title: 'Remembered after new chat' }); assert.equal((await externalResult(page)).ok, true);
  const first = (await data(page)).items.find(item => item.title === 'Remembered first item');
  await startExternal(page, 'update_item', { id: first.id, patch: { context: '@Unapproved' } }); await page.locator('#approval').waitFor({ state: 'visible' }); await approve(page, 'Deny'); assert.equal((await externalResult(page)).ok, false); assert.equal((await data(page)).items.find(item => item.id === first.id).context, '');
  await startExternal(page, 'list_attributes', {}); await approve(page, 'Allow for this chat'); assert.equal((await externalResult(page)).ok, true);
  await startExternal(page, 'list_attributes', {}); assert.equal((await externalResult(page)).ok, true); assert.equal(await page.locator('#approval').isVisible(), false);
  await startExternal(page, 'read_item', { id: first.id }); await page.locator('#approval').waitFor({ state: 'visible' }); await approve(page, 'Deny'); assert.equal((await externalResult(page)).ok, false, 'A chat grant for list_attributes cannot approve read_item');
  await startExternal(page, 'delete_item', { id: first.id }); await approve(page, 'Always allow delete_item');
  await page.getByRole('heading', { name: 'Permanently delete this subtree?', exact: true }).waitFor();
  assert.match(await page.locator('#approval').innerText(), /Permanently delete/); await approve(page, 'Allow delete (1)'); assert.equal((await externalResult(page)).ok, true);
  const second = (await data(page)).items.find(item => item.title === 'Remembered after reload');
  await startExternal(page, 'delete_item', { id: second.id }); await page.locator('#approval').waitFor({ state: 'visible' }); assert.match(await page.locator('#approval').innerText(), /Permanently delete/); await approve(page, 'Cancel'); assert.equal((await externalResult(page)).ok, false); assert((await data(page)).items.some(item => item.id === second.id));
  await info(page); await page.getByRole('button', { name: 'Revoke create_item', exact: true }).click(); assert.equal((await data(page)).settings.allowedTools.includes('create_item'), false);
  await startExternal(page, 'create_item', { title: 'Must ask after revoke' }); await page.locator('#approval').waitFor({ state: 'visible' }); await approve(page, 'Deny'); assert.equal((await externalResult(page)).ok, false);
  await info(page); await page.getByRole('button', { name: 'Revoke all remembered permissions', exact: true }).click(); assert.deepEqual((await data(page)).settings.allowedTools, []);
  await page.reload(); await ready(page); assert.deepEqual((await data(page)).settings.allowedTools, []);
  await startExternal(page, 'create_item', { title: 'DB permission probe' }); await approve(page, 'Always allow create_item'); assert.equal((await externalResult(page)).ok, true);
  // Simulate a saved revocation whose BroadcastChannel notification is absent.
  // The callback must use persisted authority even while its mirror is stale.
  await page.evaluate(async () => {
    const { openDatabase, read, put } = await import('./storage.js'); const db = await openDatabase(() => {});
    const saved = await read(db, 'preferences', 'settings'); await put(db, 'preferences', { ...saved, allowedTools: [] }); db.close();
  });
  await page.locator('#theme-button').click();
  assert.deepEqual((await data(page)).settings.allowedTools, [], 'A stale tab theme save cannot resurrect a revoked tool grant');
  await startExternal(page, 'create_item', { title: 'Must ask after DB revocation' }); await page.locator('#approval').waitFor({ state: 'visible' }); await approve(page, 'Deny'); assert.equal((await externalResult(page)).ok, false);
  assert.equal((await data(page)).items.some(item => item.title === 'Must ask after DB revocation'), false);
  await context.close();
}
async function returningDownloadConsent() {
  const { context, page } = await open();
  await page.evaluate(() => localStorage.setItem('returning-consent-probe', 'saved'));
  await context.addInitScript(() => { fixture.options.availability = 'downloadable'; });
  await page.reload(); await page.getByRole('button', { name: 'Download and continue', exact: true }).waitFor();
  assert.equal(await page.locator('#workspace').isVisible(), false);
  assert.equal(await page.evaluate(() => fixture.creates), 0, 'Returning visits cannot silently trigger a model download');
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  assert.equal(await page.evaluate(() => fixture.creates), 0);
  await page.getByRole('button', { name: 'Download and continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' });
  assert.equal((await info(page)).diagnostics.IndexedDB.action, 'opened-existing');
  await context.close();
}
async function keyboardFocus() {
  const { context, page } = await open();
  await enqueue(page, false, [reply('Hello from the local fixture.')]); await send(page, 'Hello.'); await idle(page);
  assert.equal(await page.locator('#message').evaluate(node => document.activeElement === node), true);
  await page.locator('#message').fill('First line'); await page.locator('#message').press('Shift+Enter'); assert.equal(await page.locator('#message').inputValue(), 'First line\n'); assert.equal(await page.locator('#send').isEnabled(), true);
  await enqueue(page, false, [tool('capture_tasks', { titles: ['Focus after approval'] })]); await send(page, 'Capture exact title: "Focus after approval".'); await approve(page); await idle(page);
  assert.equal(await page.locator('#message').evaluate(node => document.activeElement === node), true); assert.equal((await data(page)).items.length, 1);
  await context.close();
}
async function clarificationCancellation() {
  const { context, page } = await open(); await seedQuestions(page);
  await page.evaluate(async () => {
    const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
    await mutate(db, { kind: 'create', patch: { title: 'House repairs', type: 'Project' } }); db.close();
  });
  await page.reload(); await ready(page);
  await send(page, 'Move Inspect boiler to a Project. Ask which before changing it.'); await idle(page);
  await page.locator('#user-question').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#user-question').getByRole('button', { name: 'House repairs', exact: true }).isVisible(), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#user-question').isVisible(), false);
  assert.equal(await page.locator('#message').evaluate(node => document.activeElement === node), true);
  const before = await data(page); await enqueue(page, false, [reply('Please restate what you want to change.')]); await send(page, 'House repairs'); await idle(page);
  assert.deepEqual((await data(page)).items, before.items); assert.equal(await page.locator('#user-question').isVisible(), false);
  await context.close();
}
async function missingFeatureHelp() {
  for (const options of [{ missingModel: true }, { missingMcp: true }]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options);
    await context.addInitScript(options => {
      if (options.missingModel) Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined });
      if (options.missingMcp) Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
    }, options);
    const page = await context.newPage(); await page.goto(origin);
    await page.getByRole('heading', { name: 'This browser cannot run this prototype', exact: true }).waitFor();
    assert.equal(await page.locator('#setup-help').evaluate(node => node.open), true);
    const help = await page.locator('#setup-help').innerText(); assert.match(help, /enable-webmcp-testing/); assert.match(help, /on-device-internals/); assert.match(help, /prompt-api-tool-use/); assert.equal(await page.locator('#workspace').isVisible(), false);
    await context.close();
  }
}
async function questionFlows() {
  for (const native of [false, true]) {
    const { context, page } = await open({ nativeToolUse: native }); await seedQuestions(page); await configure(page, { native }); await grantChat(page);
    const question = { question: 'Which task should we discuss first?', options: ['Inspect boiler', 'Sentinel task'] };
    for (const custom of [false, true]) {
      const answer = custom ? 'A different topic / @Home' : 'Inspect boiler';
      await enqueue(page, native, [tool('ask_user', question), reply(`You answered: ${answer}`)]); const before = await data(page); await send(page, custom ? 'Ask me which task to discuss first.' : 'Help me choose a topic.');
      if (!custom) await approve(page, 'Always allow ask_user');
      await page.locator('#user-question').waitFor({ state: 'visible' }); assert.equal(await page.locator('#send').isEnabled(), false);
      if (custom) { await page.locator('#question-answer').fill(answer); await page.getByRole('button', { name: 'Send answer', exact: true }).click(); }
      else await page.locator('#user-question').getByRole('button', { name: answer, exact: true }).click();
      await idle(page); assert.deepEqual((await data(page)).items, before.items); assert.match(await page.locator('#chat').innerText(), /You answered:/);
      const feedback = await page.evaluate(() => fixture.prompts.slice(1).map(prompt => JSON.stringify(prompt.messages)).join('\n')); assert(feedback.includes(answer)); assert(feedback.includes(question.question));
    }
    for (const cancel of ['Stop', 'Escape']) {
      const before = await data(page); await enqueue(page, native, [tool('ask_user', question), tool('create_item', { title: 'Must not run after cancelled question' })]); await send(page, 'Ask me which task to discuss first.'); await page.locator('#user-question').waitFor({ state: 'visible' });
      if (cancel === 'Stop') await page.locator('#stop').click(); else await page.keyboard.press('Escape');
      await idle(page); assert.equal(await page.locator('#user-question').isVisible(), false); assert.deepEqual((await data(page)).items, before.items); assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['ask_user']);
    }
    if (!native) {
      // Bridge recognized actions fill their frozen arguments directly. They do
      // not insert a model question at that stage; native declarations can.
      await enqueue(page, false, [tool('ask_user', question)]); const before = await data(page);
      await send(page, 'Set the context of Inspect boiler to "@Exact requested".'); await idle(page);
      assert.deepEqual((await data(page)).items, before.items); assert.deepEqual(await page.evaluate(() => fixture.executions), []);
      assert.equal(await page.locator('#user-question').isVisible(), false);
      await enqueue(page, false, [tool('capture_tasks', { titles: ['One finite capture'] }), tool('ask_user', question)]);
      await send(page, 'Capture exact title: "One finite capture".'); await approve(page, 'Always allow capture_tasks'); await idle(page);
      assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['capture_tasks']); assert.equal(await page.locator('#user-question').isVisible(), false);
      assert.equal((await data(page)).items.filter(item => item.title === 'One finite capture').length, 1);
      await context.close(); continue;
    }
    await configure(page, { native: true });
    const current = (await data(page)).items, index = current.findIndex(item => item.title === 'Inspect boiler'), target = current[index];
    const reference = `Item ${index + 1}: ${target.title} (${target.type})`;
    await enqueue(page, native, [tool('ask_user', { question: 'Use the exact requested context?', options: ['Use supplied literal', 'Cancel'] }), tool('update_item', { id: reference, patch: { context: '@Home / repairs' } }), reply('Acknowledged.')]);
    await send(page, 'Set the context of Inspect boiler to "@Home / repairs".'); await page.locator('#user-question').waitFor({ state: 'visible' }); assert.equal((await data(page)).items.find(item => item.id === target.id).context, '@Initial');
    await page.locator('#user-question').getByRole('button', { name: 'Use supplied literal', exact: true }).click(); await approve(page, 'Always allow update_item'); await idle(page);
    assert.equal((await data(page)).items.find(item => item.id === target.id).context, '@Home / repairs'); assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['ask_user', 'update_item']);
    await enqueue(page, native, [tool('ask_user', { question: 'Proceed with the exact context?', options: ['Yes', 'No'] }), reply('No changes were made.'), tool('update_item', { id: reference, patch: { context: '@Must not save' } })]);
    const negativeBefore = await data(page); await send(page, 'Set the context of Inspect boiler to "@Must not save".'); await page.locator('#user-question').waitFor({ state: 'visible' }); await page.locator('#user-question').getByRole('button', { name: 'No', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).items, negativeBefore.items); assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['ask_user']);
    await enqueue(page, native, [tool('ask_user', { question: 'Which outcome?', options: ['Requested context', 'Complete sentinel instead'] }), tool('complete_task', { title: 'Sentinel task' })]); const before = await data(page);
    await send(page, 'Set the context of Inspect boiler to "@Exact requested".'); await page.locator('#user-question').waitFor({ state: 'visible' }); await page.locator('#user-question').getByRole('button', { name: 'Complete sentinel instead', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).items, before.items); assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['ask_user']); assert.equal(await page.locator('#approval').isVisible(), false);
    if (native) await configure(page, { native: true });
    await enqueue(page, native, [tool('capture_tasks', { titles: ['One finite capture'] }), tool('ask_user', question)]);
    await send(page, 'Capture exact title: "One finite capture".'); await approve(page, 'Always allow capture_tasks'); await idle(page);
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(entry => entry.name)), ['capture_tasks']); assert.equal(await page.locator('#user-question').isVisible(), false);
    assert.equal((await data(page)).items.filter(item => item.title === 'One finite capture').length, 1);
    if (native) {
      const priorBatch = await data(page);
      await configure(page, { native: true }); await page.evaluate(reference => { fixture.responses = [[{ type: 'tool-call', value: new LanguageModelToolCall({ callId: 'batch-ask', name: 'ask_user', arguments: { question: 'Proceed?', options: ['Yes', 'No'] } }) }, { type: 'tool-call', value: new LanguageModelToolCall({ callId: 'batch-write', name: 'update_item', arguments: { id: reference, patch: { context: '@Exact requested' } } }) }]]; fixture.executions = []; }, reference);
      await send(page, 'Set the context of Inspect boiler to "@Exact requested".'); await idle(page); assert.deepEqual(await page.evaluate(() => fixture.executions), []); assert.equal(await page.locator('#user-question').isVisible(), false); assert.deepEqual((await data(page)).items, priorBatch.items);
    }
    await context.close();
  }
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  await layoutAndNavigation(); await rememberedPermissionsAndStorage(); await returningDownloadConsent(); await keyboardFocus(); await clarificationCancellation(); await missingFeatureHelp(); await questionFlows();
  await browser.close(); console.log('Usability passed: proportional desktop panels, mobile switching, navigation/Tools return, keyboard focus, remembered per-tool permissions/revoke/deletion confirmation, version-only storage setup, startup help, and bounded model question/answer/cancellation flows in both adapters.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

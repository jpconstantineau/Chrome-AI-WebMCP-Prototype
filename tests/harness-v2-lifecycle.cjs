const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
const URL = process.env.APP_URL || 'http://127.0.0.1:8765';
async function open(options = {}, prepare = true) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options);
  const page = await context.newPage(); await page.goto(URL);
  if (prepare) { await require('./startup-ui.cjs')(page); await page.locator('#workspace').waitFor({ state: 'visible' }); }
  return { page, context };
}
async function idle(page) { await require('./finish-turn.cjs')(page); }
async function send(page, request) { await page.locator('#message').fill(request); await page.locator('#send').click(); }
async function facts(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return { items: await read(db, 'items'), review: await read(db, 'reviews', 'weekly') }; } finally { db.close(); } }); }
async function diagnostics(page) { if (await page.getByRole('heading', { name: 'Tools & diagnostics', exact: true }).isVisible()) await page.locator('#tools-button').click(); await page.locator('#tools-button').click(); return JSON.parse(await page.locator('#content > pre').first().innerText()); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  {
    const { page, context } = await open({ nativeToolUse: true });
    const info = await diagnostics(page); assert.equal(info.modelToolLoop, 'Constrained JSON bridge'); assert.equal(info.nativeCanaryReady, false); assert.equal(info.catalogProfile, 'standard');
    assert.equal(await page.evaluate(() => fixture.modelSettings[0].tools), undefined); assert.equal(await page.evaluate(() => fixture.tools.size), 17);
    // A root chat grant cannot bypass scoped canary consent.
    await page.evaluate(() => { window.external = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'list_attributes'), {})); });
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await page.evaluate(() => external);
    await page.getByRole('button', { name: 'Test native tool calls', exact: true }).click(); await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Allow for this chat', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    let passed = JSON.parse(await page.locator('#content > pre').first().innerText()); assert.equal(passed.nativeCanaryReady, true); assert.equal(passed.diagnostics['native-feedback'].outcome, 'pass');
    await page.getByRole('button', { name: 'Use native proposals', exact: true }).click(); assert.match((await diagnostics(page)).modelToolLoop, /Native/);
    assert.equal((await facts(page)).items.length, 0); assert.equal(await page.evaluate(() => fixture.maxLive), 2);
    await page.reload(); await require('./startup-ui.cjs')(page); await page.locator('#workspace').waitFor({ state: 'visible' }); passed = await diagnostics(page);
    assert.equal(passed.nativeCanaryReady, false); assert.deepEqual(passed.toolPermission, { chatTools: [], rememberedTools: [], otherTools: 'Ask on use' }); assert.equal(passed.modelToolLoop, 'Constrained JSON bridge');
    await context.close();
  }
  for (const options of [{}, { nativeToolUse: true, canaryResponse: [{ type: 'text', value: 'No tool needed.' }] }, { nativeToolUse: true, canaryResponse: [{ type: 'tool-call', value: { callId: 'bad', name: 'create_item', arguments: { title: 'Unauthorized' } } }] }, { nativeToolUse: true, nativeAvailability: 'unavailable' }, { nativeToolUse: true, canaryError: true }]) {
    const { page, context } = await open(options); await diagnostics(page);
    const probe = page.getByRole('button', { name: 'Test native tool calls', exact: true });
    if (!options.nativeToolUse) assert.equal(await probe.isDisabled(), true);
    else { await probe.click(); await idle(page); assert.equal((await diagnostics(page)).nativeCanaryReady, false); }
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await facts(page)).items.length, 0); await context.close();
  }
  for (const progress of [1, null, -1, 2]) {
    const { page, context } = await open({ availability: 'downloadable', progress, createDelay: 300 }, false);
    await page.getByRole('button', { name: 'Download and continue', exact: true }).click();
    if (progress === 1) { await page.getByText('Download reported complete; preparing AI…', { exact: true }).waitFor(); assert.equal(await page.locator('#workspace').isVisible(), false); }
    else { await page.getByText('Downloading/preparing AI; progress unavailable…', { exact: true }).waitFor(); assert.equal(await page.locator('#download-progress').getAttribute('value'), null); }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.waitForTimeout(350); assert.equal(await page.evaluate(() => fixture.live), 0); assert.equal(await page.locator('#workspace').isVisible(), false); await context.close();
  }
  // The transaction is already durable when Stop runs, before the callback's await continuation.
  for (const name of ['create_item', 'update_item', 'update_attribute', 'set_parent', 'delete_item', 'capture_tasks', 'weekly_review']) {
    const { page, context } = await open(); await configureHarness(page);
    await page.evaluate(async name => {
      const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
      const item = await mutate(db, { kind: 'create', patch: { title: 'Receipt target' } }), parent = await mutate(db, { kind: 'create', patch: { title: 'Receipt project', type: 'Project' } }); db.close();
      const reference = item => `Item ${fixture.seedOrder.indexOf(item.id) + 1}: ${item.title} (${item.type})`;
      const { openDatabase: open, read } = await import('./storage.js'); const current = await open(() => {}); fixture.seedOrder = (await read(current, 'items')).map(item => item.id); current.close();
      const args = { create_item: { title: 'Committed after Stop' }, update_item: { id: reference(item), patch: { description: 'Durable detail' } }, update_attribute: { id: reference(item), attribute: 'status', value: 'Blocked' }, set_parent: { id: reference(item), parentId: reference(parent) }, delete_item: { id: reference(item) }, capture_tasks: { titles: ['Committed after Stop'] }, weekly_review: { action: 'start' } }[name];
      fixture.responses.push({ message: '', tool: { name, arguments: args } }, { message: 'Late false completion.', tool: null });
      const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...descriptor, set(handler) { const tx = this; descriptor.set.call(this, tx.mode === 'readwrite' && [...tx.objectStoreNames].some(store => ['items', 'reviews'].includes(store)) ? function(event) { queueMicrotask(() => document.querySelector('#stop').click()); handler.call(tx, event); } : handler); } });
    }, name);
    await send(page, `Update authorized receipt check ${name}.`); await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    if (name === 'delete_item') await page.getByRole('button', { name: 'Allow delete (1)', exact: true }).click();
    await idle(page); await page.waitForTimeout(80);
    const info = await diagnostics(page); assert.equal(info.lastRun.reason, 'cancellation'); assert.equal(info.lastRun.totals.dispatches, 1);
    const text = await page.locator('#chat').innerText(); assert.match(text, name === 'weekly_review' ? /Weekly review started/ : name === 'delete_item' ? /Deleted 1 item\(s\): Receipt target/ : name === 'capture_tasks' ? /Captured 1 new task/ : /Saved “/); assert.doesNotMatch(text, /Late false completion/);
    assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal(info.lastRun.totals.settledCalls.length, 1); await context.close();
  }
  {
    const { page, context } = await open({ afterCommitError: true }); await configureHarness(page);
    await page.evaluate(() => fixture.responses.push({ message: '', tool: { name: 'create_item', arguments: { title: 'Proven committed' } } }, { message: '', tool: { name: 'create_item', arguments: { title: 'Must not run' } } }));
    await send(page, 'Create Proven committed, then create Must not run.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.deepEqual((await facts(page)).items.map(item => item.title), ['Proven committed']); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.match(await page.locator('#chat').innerText(), /Saved “Proven committed”/); assert.equal(await page.locator('#retry-message').isVisible(), false); await context.close();
  }
  {
    const { page, context } = await open(); await configureHarness(page);
    await page.evaluate(() => { fixture.responses.push({ message: '', tool: { name: 'create_item', arguments: { title: 'Saved before render fault' } } }, { message: '', tool: { name: 'create_item', arguments: { title: 'Must not render-dispatch' } } }); const original = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function(...args) { if (this.id === 'navigation') { Element.prototype.replaceChildren = original; throw new Error('Fixture post-commit render failure'); } return original.apply(this, args); }; });
    await send(page, 'Create two items.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page); assert.equal((await facts(page)).items.length, 1); assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.match(await page.locator('#chat').innerText(), /Saved “Saved before render fault”/); await context.close();
  }
  {
    const { page, context } = await open(); await configureHarness(page);
    await page.evaluate(() => { window.mutableExternalArgs = { title: 'Immutable approved title' }; window.external = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'create_item'), mutableExternalArgs)); });
    await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor();
    await page.evaluate(() => { mutableExternalArgs.title = 'Changed while approving'; });
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await page.evaluate(() => external);
    assert.deepEqual((await facts(page)).items.map(item => item.title), ['Immutable approved title']); await context.close();
  }
  {
    const { page, context } = await open();
    await page.evaluate(() => fixture.responses.push('"respond"', { delay: 250, envelope: { message: 'A root read-only explanation.' } }));
    await send(page, 'Explain the list without changing it.'); await page.waitForFunction(() => fixture.prompts.length === 2);
    await page.evaluate(() => { window.external = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === 'create_item'), { title: 'External callback item' })); });
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await page.evaluate(() => external); await idle(page);
    const observed = await diagnostics(page); assert.equal(observed.lastRun.totals.dispatches, 0); assert.equal(observed.lastRun.totals.committedCalls.length, 0); assert.equal((await facts(page)).items.length, 1); assert.doesNotMatch(await page.locator('.message.assistant').innerText(), /Saved/); await context.close();
  }
  for (const legacyArguments of [false, true]) {
    for (const ownOutcome of ['lost', 'delivered', 'stopped']) {
      const { page, context } = await open({ legacyArguments });
      await page.evaluate(({ legacyArguments, ownOutcome }) => {
        fixture.responses.push({ message: '', tool: { name: 'create_item', arguments: { title: 'Identical public arguments' } } }, { message: 'Finished.', tool: null });
        const execute = document.modelContext.executeTool;
        document.modelContext.executeTool = async (descriptor, args, settings = {}) => {
          const parsed = legacyArguments ? JSON.parse(args) : args;
          if (!Object.hasOwn(parsed, '__ownDispatchToken')) return execute(descriptor, args, settings);
          fixture.ownMetadataPresent = true;
          const publicArgs = { ...parsed }; delete publicArgs.__ownDispatchToken;
          await execute(descriptor, legacyArguments ? JSON.stringify(publicArgs) : publicArgs, {});
          fixture.externalCompleted = true;
          if (ownOutcome === 'lost') throw new Error('Own invocation lost before callback delivery');
          if (ownOutcome === 'stopped') { await new Promise(resolve => { window.releaseOwnInvocation = resolve; }); }
          const result = await execute(descriptor, args, settings); fixture.ownCallbackResult = JSON.parse(result); return result;
        };
      }, { legacyArguments, ownOutcome });
      await send(page, 'Create Identical public arguments.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click();
      await page.waitForFunction(() => fixture.externalCompleted);
      if (ownOutcome === 'delivered') { await page.getByRole('button', { name: 'Allow once', exact: true }).click(); }
      if (ownOutcome === 'stopped') { await page.locator('#stop').click(); await page.evaluate(() => releaseOwnInvocation()); }
      await idle(page); await page.waitForTimeout(80);
      const observed = await diagnostics(page), rows = await facts(page);
      assert.equal(await page.evaluate(() => fixture.ownMetadataPresent), true);
      assert.equal(observed.lastRun.totals.dispatches, 1);
      assert.equal(observed.lastRun.totals.committedCalls.length, ownOutcome === 'delivered' ? 1 : 0, 'An identical external callback must never become a root receipt');
      assert.equal(rows.items.length, ownOutcome === 'delivered' ? 2 : 1);
      if (ownOutcome === 'lost') { assert.equal(observed.lastRun.reason, 'uncertain'); assert.doesNotMatch(await page.locator('.message.assistant').innerText(), /Saved “Identical/); }
      if (ownOutcome === 'stopped') { assert.equal(observed.lastRun.reason, 'cancellation'); assert.equal(await page.evaluate(() => fixture.ownCallbackResult.error.code), 'cancelled'); }
      const trace = await page.evaluate(() => JSON.stringify({ prompts: fixture.prompts, activity: document.querySelector('#chat').textContent, diagnostics: document.querySelector('#content > pre').textContent, declarations: fixture.modelSettings, executions: fixture.executions }));
      assert.doesNotMatch(trace, /__ownDispatchToken/, 'Private invocation metadata must not enter model/public/activity/diagnostic traces');
      await context.close();
    }
  }
  await browser.close(); console.log('Harness v2 lifecycle passed: bridge startup, scoped canary despite root grant, failure/unsupported probes, preparation progress/cancel/late sessions, seven callback commit-before-Stop paths, rendering/lost-response receipts, and zero replay.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

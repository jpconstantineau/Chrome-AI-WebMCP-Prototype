// A committed insertion must not renumber references retained by the current model turn.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
const URL = process.env.APP_URL || 'http://127.0.0.1:8765';
let browser;
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const options of [{ legacyArguments: true }, { nativeToolUse: true, legacyArguments: true, idKey: 'callID' }, { nativeToolUse: true, idKey: 'callId' }]) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(fixture, options);
    const page = await context.newPage(); await page.goto(URL);
    await require('./startup-ui.cjs')(page);
    await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
    await page.evaluate(async () => {
      const { openDatabase, put } = await import('./storage.js');
      const db = await openDatabase(() => {});
      // Generated UUIDs sort before this legacy string key in IndexedDB.
      fixture.originalID = 'zzzz-existing-item';
      await put(db, 'items', { id: fixture.originalID, title: 'Same title', type: 'Task', status: 'Open', description: 'Original record', context: '', parentId: null, createdAt: '2026-10-11T12:00:00.000Z', updatedAt: '2026-10-11T12:00:00.000Z' }); db.close();
      let serial = 0;
      const call = (name, args) => fixture.options.nativeToolUse
        ? [{ type: 'tool-call', value: new LanguageModelToolCall({ [fixture.options.idKey]: `catalog-call-${++serial}`, name, arguments: args }) }]
        : { message: '', tool: { name, arguments: args } };
      const feedback = () => {
        const prompt = fixture.prompts.at(-1);
        if (prompt.input?.DATA?.toolResults?.length) return prompt.input.DATA.toolResults.at(-1).result;
        const text = prompt.messages[0].content.find(part => part.type === 'tool-response').value.result[0].value;
        return JSON.parse(text.match(/^<[^>]+>\n([\s\S]*)\n<\/[^>]+>$/u)[1]);
      };
      fixture.responses.push(
        Object.assign(() => {
          fixture.originalReference = 'Item 1: Same title (Task)';
          return call('create_item', { title: 'Same title', description: 'New duplicate' });
        }, { route: 'create_item' }),
        Object.assign(() => { fixture.createdFeedback = feedback(); return call('read_item', { id: fixture.originalReference }); }, { route: 'read_item' }),
        Object.assign(() => {
          fixture.readFeedback = feedback();
          return fixture.options.nativeToolUse ? [{ type: 'text', value: 'Read the original record.' }] : { message: 'Read the original record.', tool: null };
        }, { route: 'respond' })
      );
    });
    await page.locator('#message').fill('Create another Same title task, then read the original record.');
    await page.locator('#send').click();
    for (let round = 0; round < 4; round++) {
      await page.waitForFunction(() => !document.querySelector('#send').disabled || [...document.querySelectorAll('#approval button')].some(button => button.textContent === 'Allow once'));
      if (await page.locator('#send').isEnabled()) break;
      await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    }
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    const actual = await page.evaluate(async () => {
      const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
      const records = await read(db, 'items'); db.close();
      return { originalID: fixture.originalID, originalReference: fixture.originalReference, created: fixture.createdFeedback, read: fixture.readFeedback, calls: fixture.executions, records };
    });
    assert.equal(actual.records.length, 2);
    assert.notEqual(actual.records[0].id, actual.originalID, 'The inserted duplicate must precede the original in IDB ordering');
    assert.equal(actual.records[1].id, actual.originalID);
    assert.equal(actual.created.ok, true);
    assert.equal(actual.created.data.id, '[unavailable item reference]', 'A new item must not reuse an original selectable alias');
    assert.equal(actual.calls.length, 2);
    assert.equal(actual.calls[1].name, 'read_item');
    assert.equal(actual.calls[1].args.id, actual.originalID, 'The retained alias must still dispatch against the original record');
    assert.equal(actual.read.data.id, actual.originalReference);
    assert.equal(actual.read.data.description, 'Original record');
    await context.close();
  }
  await browser.close();
  console.log('Catalog continuation passed: UUID insertion before duplicate-title record preserves original aliases and dispatch targets in JSON and both typed contracts.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

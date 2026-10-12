const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
let browser;
async function approveTurn(page) {
  for (let rounds = 0; rounds < 20; rounds++) {
    await page.waitForFunction(() => !document.querySelector('#send').disabled || [...document.querySelectorAll('#approval button')].some(button => button.textContent === 'Allow once'));
    if (await page.locator('#send').isEnabled()) return;
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  }
  throw new Error('The scripted workflow did not finish.');
}
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); await approveTurn(page); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const options of [{ legacyArguments: true }, { nativeToolUse: true, legacyArguments: true, idKey: 'callID' }, { nativeToolUse: true, idKey: 'callId' }]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options);
    const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
    await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
      const task = await mutate(db, { kind: 'create', patch: { title: 'Research for new car', description: 'Compare total cost and reliability', context: '@Home' } }); db.close(); fixture.research = task;
      let serial = 0;
      fixture.call = (name, args, message = '') => fixture.options.nativeToolUse ? [...(message ? [{ type: 'text', value: message }] : []), { type: 'tool-call', value: new LanguageModelToolCall({ [fixture.options.idKey]: `opaque-${++serial}`, name, arguments: args }) }] : { message, tool: { name, arguments: args } };
      fixture.answer = message => fixture.options.nativeToolUse ? [{ type: 'text', value: message }] : { message, tool: null };
      fixture.lastResult = () => {
        const prompt = fixture.prompts.at(-1); if (!fixture.options.nativeToolUse) return prompt.input.DATA.toolResults.at(-1).result;
        const value = prompt.messages[0].content.filter(part => part.type === 'tool-response').at(-1).value.result[0].value;
        return JSON.parse(value.match(/^<[^>]+>\n([\s\S]*)\n<\/[^>]+>$/)[1]);
      };
      fixture.responses.push(
        fixture.call('add_shopping_item', { title: 'Bananas' }),
        fixture.answer('Added Bananas to Shopping List.')
      );
    });
    await send(page, 'add bananas to shopping list');
    let saved = await page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items; });
    const shopping = saved.find(item => item.type === 'Shopping List'); const banana = saved.find(item => item.title === 'Bananas');
    assert.equal(saved.filter(item => item.type === 'Shopping List').length, 1); assert.equal(banana.type, 'Task'); assert.equal(banana.parentId, shopping.id);
    await page.evaluate(() => fixture.responses.push(fixture.call('add_shopping_item', { title: 'Bananas' }), fixture.answer('Added Bananas again.')));
    await send(page, 'add bananas to shopping list');
    assert.equal(await page.evaluate(() => fixture.executions.filter(call => call.name === 'add_shopping_item').length), 2);
    assert.equal((await page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items; })).length, 3);
    assert.match(await page.locator('#chat').innerText(), /“Bananas” is already listed in “Shopping List”/);
    assert.equal((await page.locator('#chat').innerText()).includes('Added Bananas again.'), false);
    await page.evaluate(() => fixture.responses.push(fixture.call('complete_task', { title: 'Research for new car' }), fixture.answer('Marked Research for new car as completed.')));
    await page.locator('#navigation').getByRole('button', { name: 'Research for new car', exact: true }).click();
    assert.equal(await page.locator('#item-status').inputValue(), 'Open');
    await send(page, 'completed research for new car');
    assert.equal(await page.locator('#item-status').inputValue(), 'Completed');
    const research = await page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const item = await read(db, 'items', fixture.research.id); db.close(); return item; });
    assert.equal(research.status, 'Completed'); assert.equal(research.title, 'Research for new car'); assert.equal(research.description, 'Compare total cost and reliability'); assert.equal(research.context, '@Home');
    assert.equal(await page.evaluate(() => fixture.executions.filter(call => call.name === 'complete_task').length), 1);
    if (options.nativeToolUse) {
      assert.equal(await page.evaluate(() => fixture.modelSettings[0].tools.length), 16);
      assert.equal(await page.evaluate(() => fixture.prompts.some(prompt => prompt.constrained)), false);
      const identities = await page.evaluate(() => fixture.prompts.flatMap(prompt => Array.isArray(prompt.messages) ? prompt.messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(part => part.type === 'tool-response').map(part => part.value[fixture.options.idKey]) : []) : []));
      assert.equal(identities.length, 3); assert.equal(new Set(identities).size, 3);
    }
    // An LLM repeated proposal must never create a second shopping entry.
    await page.evaluate(() => fixture.responses.push(fixture.call('add_shopping_item', { title: 'Apples' }), fixture.call('add_shopping_item', { title: 'Apples' })));
    await send(page, 'add apples to shopping list');
    assert.match(await page.locator('#chat').innerText(), /Stopped a repeated proposal/);
    assert.doesNotMatch(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.executions.filter(call => call.name === 'add_shopping_item' && call.args.title === 'Apples').length), 1);
    assert.equal(await page.locator('#retry-message').isVisible(), false);
    if (options.nativeToolUse) {
      await page.evaluate(() => fixture.responses.push([...fixture.call('create_item', { title: 'Denied item' }), ...fixture.call('create_item', { title: 'Queued item' })], fixture.call('create_item', { title: 'Retry after denial' })));
      await page.locator('#message').fill('Add two permission-test items.'); await page.locator('#send').click();
      await page.getByRole('button', { name: 'Deny', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#send').disabled);
      const errors = await page.evaluate(() => fixture.prompts.at(-1).messages[0].content.filter(part => part.type === 'tool-response').map(part => ({ name: part.value.name, id: part.value[fixture.options.idKey], message: part.value.errorMessage })));
      assert.equal(errors.length, 2); assert.notEqual(errors[0].id, errors[1].id); assert.match(errors[0].message, /permission denied/); assert.match(errors[1].message, /Skipped/);
      assert.equal(await page.evaluate(() => fixture.executions.some(call => ['Queued item', 'Retry after denial'].includes(call.args.title))), false);
    }
    // A denied workflow must never display invented success before or after its card.
    await page.evaluate(() => {
      fixture.responses.push(fixture.call('add_shopping_item', { title: 'Denied workflow purchase' }, 'Added before permission.'));
      if (fixture.options.nativeToolUse) fixture.responses.push(fixture.answer('Added despite denied permission.'));
    });
    await page.locator('#message').fill('Add a permission-test purchase.'); await page.locator('#send').click();
    await page.getByRole('button', { name: 'Deny', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#send').disabled);
    const deniedChat = await page.locator('#chat').innerText();
    assert.equal(deniedChat.includes('Added before permission.'), false); assert.equal(deniedChat.includes('Added despite denied permission.'), false);
    assert.match(deniedChat, /Tool stopped: Tool permission denied/);
    assert.equal(await page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items.some(item => item.title === 'Denied workflow purchase'); }), false);
    // The model must wait for the user's choice instead of guessing after ambiguity.
    await page.evaluate(async () => {
      const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
      await mutate(db, { kind: 'create', patch: { title: 'Hardware Store', type: 'Shopping List' } }); db.close();
      fixture.responses.push(fixture.call('add_shopping_item', { title: 'Ambiguous purchase' }));
      if (fixture.options.nativeToolUse) fixture.responses.push(fixture.call('create_item', { title: 'Guessed after clarification' }));
    });
    await send(page, 'add ambiguous purchase to shopping list');
    assert.match(await page.locator('#chat').innerText(), /Which shopping list should I add this item to/);
    assert.equal(await page.evaluate(() => fixture.executions.some(call => call.args.title === 'Guessed after clarification')), false);
    assert.equal(await page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'); db.close(); return items.some(item => item.title === 'Ambiguous purchase'); }), false);
    await context.close();
  }
  await browser.close(); console.log('Natural workflow harness passed: list/container + child creation, completion preserving attributes, both native call-ID contracts, and no duplicated write. Model decisions are scripted; real-model inference requires native review.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

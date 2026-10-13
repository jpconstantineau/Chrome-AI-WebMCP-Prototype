// Raw stage responses exercise production parsing rather than the fixture's
// semantic-envelope adapter. Native execution is doubled; IndexedDB is real.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
async function open(responses) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(fixture, { legacyArguments: true });
  const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
  await page.evaluate(responses => fixture.responses.push(...responses), responses);
  return { context, page };
}
async function send(page, text = 'Save two Inbox thoughts: first thought and second thought.') { await page.locator('#message').fill(text); await page.locator('#send').click(); }
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function data(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return await read(db, 'items'); } finally { db.close(); } }); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  {
    const { context, page } = await open(['"capture_tasks"', '{"titles":["First thought","Second thought"]}', '"respond"', '{"message":"Incorrect model acknowledgement."}']);
    await send(page); await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor();
    assert.equal((await data(page)).length, 0, 'Inference stages do not save anything before approval');
    const before = await page.evaluate(() => fixture.prompts);
    assert.deepEqual(before.map(prompt => prompt.stage), ['route', 'arguments']);
    assert.equal(before[0].responseConstraint.type, 'string'); assert.ok(before[0].responseConstraint.enum.includes('capture_tasks'));
    assert.equal(before[0].input.tools.some(tool => Object.hasOwn(tool, 'inputSchema')), false, 'The router receives names/descriptions only');
    assert.deepEqual(before[1].input.tools.map(tool => tool.name), ['capture_tasks']);
    assert.deepEqual(before[1].responseConstraint, before[1].input.tools[0].inputSchema);
    assert.deepEqual(before[1].responseConstraint.required, ['titles']); assert.equal(Object.hasOwn(before[1].responseConstraint.properties, 'tool'), false);
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).map(item => item.title).sort(), ['First thought', 'Second thought']);
    assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    const after = await page.evaluate(() => fixture.prompts);
    assert.deepEqual(after.map(prompt => prompt.stage), ['route', 'arguments']);
    assert.equal((await page.locator('#chat').innerText()).includes('Incorrect model acknowledgement.'), false, 'Authoritative workflow receipt replaces model wording');
    await context.close();
  }
  // Stage two cannot turn the selected operation into another tool or decline it
  // using the old envelope. Null and malformed output cannot reach approval.
  for (const args of ['null', '{"tool":null,"message":"Skipped"}', '{"name":"delete_item","arguments":{}}', '{"titles":[]}']) {
    const { context, page } = await open(['"capture_tasks"', args]); await send(page); await idle(page);
    assert.match(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0);
    assert.equal(await page.locator('#approval').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => fixture.prompts.map(prompt => prompt.stage)), ['route', 'arguments']);
    await context.close();
  }
  for (const name of ['read_item', 'not_registered']) {
    const { context, page } = await open([JSON.stringify(name)]); await send(page); await idle(page);
    assert.match(await page.locator('#status').innerText(), /unavailable operation/);
    assert.equal(await page.evaluate(() => fixture.prompts.length), 1); assert.equal(await page.evaluate(() => fixture.executions.length), 0);
    await context.close();
  }
  {
    const { context, page } = await open(['"respond"', '{"message":"Hello","tool":{"name":"capture_tasks","arguments":{"titles":["Hidden"]}}}']);
    await send(page); await idle(page); assert.match(await page.locator('#status').innerText(), /invalid reply/);
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0); await context.close();
  }
  for (const stage of ['route', 'arguments']) {
    const responses = stage === 'route'
      ? [{ delay: 250, envelope: { tool: { name: 'capture_tasks' } } }]
      : ['"capture_tasks"', { delay: 250, envelope: { titles: ['Late cancelled thought'] } }];
    const { context, page } = await open(responses); await send(page);
    await page.waitForFunction(stage => fixture.prompts.at(-1)?.stage === stage, stage);
    await page.locator('#stop').click();
    // Let the intentionally signal-ignoring fixture settle; a fresh user turn
    // must still be usable and the late old response must not generate a card.
    await page.waitForTimeout(300); await idle(page);
    assert.equal(await page.evaluate(() => fixture.prompts.length), stage === 'route' ? 1 : 2);
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0);
    assert.equal(await page.locator('#approval').isVisible(), false); await context.close();
  }
  {
    const { context, page } = await open(['"capture_tasks"', '{"titles":["Committed once"]}', { error: 'Routing failed after commit' }]);
    await send(page); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 1); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    assert.deepEqual(await page.evaluate(() => fixture.prompts.map(prompt => prompt.stage)), ['route', 'arguments']);
    assert.equal(await page.locator('#retry-message').isVisible(), false); await context.close();
  }
  const literalNames = ['Compare car insurance', 'Book a test drive', 'Renew my passport'];
  const literalRequest = 'Save three separate Inbox tasks named “Compare car insurance”, “Book a test drive”, and “Renew my passport”.';
  for (const titles of [literalNames.slice(0, 2), ['Compare car insurance', 'Book test drive', 'Renew passport'], [literalNames[0], literalNames[0], literalNames[2]]]) {
    const { context, page } = await open([JSON.stringify({ titles })]); await send(page, literalRequest); await idle(page);
    assert.match(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0);
    assert.equal(await page.locator('#approval').isVisible(), false, 'Incomplete or shortened explicit names cannot reach native approval');
    const schema = await page.evaluate(() => fixture.prompts.at(-1).responseConstraint);
    assert.deepEqual(schema.properties.titles.items.enum, literalNames);
    assert.equal(schema.properties.titles.minItems, 3); assert.equal(schema.properties.titles.maxItems, 3);
    await context.close();
  }
  {
    const { context, page } = await open([JSON.stringify({ titles: [...literalNames].reverse() })]);
    await send(page, literalRequest); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).map(item => item.title).sort(), [...literalNames].sort());
    assert.equal(await page.evaluate(() => fixture.executions.length), 1); await context.close();
  }
  for (const names of [['Call Mom', 'Call mom'], ['Book a test drive', 'Book  a test drive']]) {
    const { context, page } = await open([JSON.stringify({ titles: names })]);
    await send(page, `Save exact titles: ${names.map(name => JSON.stringify(name)).join(', ')}.`); await idle(page);
    assert.match(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.prompts.length), 0, 'Domain-normalized literal collisions must be rejected before inference');
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0); await context.close();
  }
  {
    const responses = Array.from({ length: 7 }, (_, index) => JSON.stringify({ titles: [`Capped thought ${index + 1}`] }));
    const { context, page } = await open(responses);
    await send(page, Array.from({ length: 7 }, (_, index) => `Capture exact title: "Capped thought ${index + 1}"`).join(' and ') + '.');
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 6); assert.equal(await page.evaluate(() => fixture.executions.length), 6); assert.equal(await page.locator('#continue-message').isVisible(), true);
    await page.evaluate(() => { fixture.responses = [JSON.stringify({ titles: ['Capped thought 7'] })]; });
    await page.locator('#continue-message').click(); await idle(page); assert.equal((await data(page)).length, 7); assert.equal(await page.evaluate(() => fixture.executions.length), 7);
    assert.equal(((await page.locator('#chat').innerText()).match(/Captured 1 new task\(s\) in Inbox\./g) || []).length, 7); await context.close();
  }
  {
    const { context, page } = await open([]);
    await page.evaluate(async () => { const {openDatabase,mutate}=await import('./storage.js'); const db=await openDatabase(()=>{}); await mutate(db,{kind:'create',patch:{title:'Check novel stale call'}}); db.close(); });
    await send(page, 'Complete Check novel stale call and set Check novel stale call to Blocked.'); await idle(page);
    assert.equal((await data(page))[0].status, 'Open'); assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.match(await page.locator('#chat').innerText(), /conflicting/); await context.close();
  }
  await browser.close(); console.log('Bridge routing passed: selected-operation-only grammar, approval, validated replies, malformed/unknown operations blocked, Stop between stages and no post-success reroute, finite seven-step Continue and pre-write contradictory-field clarification. Scripted proposals; real inference remains separate.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

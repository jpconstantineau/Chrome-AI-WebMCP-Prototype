// Raw stage responses exercise production parsing rather than the fixture's
// semantic-envelope adapter. Native execution is doubled; IndexedDB is real.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
let browser;
async function open(responses) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(fixture, { legacyArguments: true });
  const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(responses => fixture.responses.push(...responses), responses);
  return { context, page };
}
async function send(page, text = 'Capture first thought and second thought in Inbox.') { await page.locator('#message').fill(text); await page.locator('#send').click(); }
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
    assert.deepEqual(after.map(prompt => prompt.stage), ['route', 'arguments', 'route', 'respond']);
    assert.equal(after[2].input.DATA.toolResults[0].result.ok, true);
    assert.equal(Object.hasOwn(after[3].input, 'tools'), false);
    assert.deepEqual(Object.keys(after[3].responseConstraint.properties), ['message']);
    assert.equal(after[3].responseConstraint.properties.message.maxLength, 600);
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
    assert.deepEqual(await page.evaluate(() => fixture.prompts.map(prompt => prompt.stage)), ['route', 'arguments', 'route']);
    assert.equal(await page.locator('#retry-message').isVisible(), false); await context.close();
  }
  const literalNames = ['Compare car insurance', 'Book a test drive', 'Renew my passport'];
  const literalRequest = 'Save three separate Inbox tasks named “Compare car insurance”, “Book a test drive”, and “Renew my passport”.';
  for (const titles of [literalNames.slice(0, 2), ['Compare car insurance', 'Book test drive', 'Renew passport'], [literalNames[0], literalNames[0], literalNames[2]]]) {
    const { context, page } = await open(['"capture_tasks"', JSON.stringify({ titles })]); await send(page, literalRequest); await idle(page);
    assert.match(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0);
    assert.equal(await page.locator('#approval').isVisible(), false, 'Incomplete or shortened explicit names cannot reach native approval');
    const schema = await page.evaluate(() => fixture.prompts.at(-1).responseConstraint);
    assert.deepEqual(schema.properties.titles.items.enum, literalNames);
    assert.equal(schema.properties.titles.minItems, 3); assert.equal(schema.properties.titles.maxItems, 3);
    await context.close();
  }
  {
    const { context, page } = await open(['"capture_tasks"', JSON.stringify({ titles: [...literalNames].reverse() }), '"respond"', '{"message":"Saved."}']);
    await send(page, literalRequest); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).map(item => item.title).sort(), [...literalNames].sort());
    assert.equal(await page.evaluate(() => fixture.executions.length), 1); await context.close();
  }
  for (const names of [['Call Mom', 'Call mom'], ['Book a test drive', 'Book  a test drive']]) {
    const { context, page } = await open(['"capture_tasks"', JSON.stringify({ titles: names })]);
    await send(page, `Save exact titles: ${names.map(name => JSON.stringify(name)).join(', ')}.`); await idle(page);
    assert.match(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.evaluate(() => fixture.prompts.length), 0, 'Domain-normalized literal collisions must be rejected before inference');
    assert.equal(await page.evaluate(() => fixture.executions.length), 0); assert.equal((await data(page)).length, 0); await context.close();
  }
  {
    const responses = [];
    for (let n = 1; n <= 7; n++) responses.push('"capture_tasks"', JSON.stringify({ titles: [`Capped thought ${n}`] }));
    const { context, page } = await open(responses); await send(page, 'Capture seven separate thoughts in Inbox.');
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 6); assert.equal(await page.evaluate(() => fixture.executions.length), 6);
    assert.equal(await page.locator('#continue-message').isVisible(), true);
    assert.equal(((await page.locator('#chat').innerText()).match(/Captured 1 new task\(s\) in Inbox\./g) || []).length, 6, 'Cap displays each verified receipt exactly once');
    await page.evaluate(() => fixture.responses.push('"respond"', '{"message":"The prior six changes are saved."}'));
    await page.locator('#continue-message').click(); await idle(page);
    assert.equal((await data(page)).length, 6); assert.equal(await page.evaluate(() => fixture.executions.length), 6);
    assert.equal(((await page.locator('#chat').innerText()).match(/Captured 1 new task\(s\) in Inbox\./g) || []).length, 6, 'Resumed final response does not duplicate already reported receipts');
    await context.close();
  }
  // Informational handling applies to exact completed signatures only. A new
  // call for the changed record must still fail current-data validation.
  {
    const { context, page } = await open([]);
    await page.evaluate(async () => {
      const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {});
      try { await mutate(db, { kind: 'create', patch: { title: 'Check novel stale call' } }); } finally { db.close(); }
      fixture.responses.push('"complete_task"', '{"title":"Check novel stale call"}', '"set_task_status"', '{"title":"Check novel stale call","status":"Blocked"}');
    });
    await send(page, 'Complete Check novel stale call and then mark that task blocked.');
    await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.equal((await data(page))[0].status, 'Completed');
    assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    assert.match(await page.locator('#status').innerText(), /changed/);
    assert.doesNotMatch(await page.locator('#chat').innerText(), /Stopped a repeated proposal/);
    await context.close();
  }
  await browser.close(); console.log('Bridge routing passed: selected-operation-only grammar, approval, validated replies, malformed/unknown operations blocked, Stop between stages and no replay after post-commit routing failure. Scripted proposals; real inference remains separate.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

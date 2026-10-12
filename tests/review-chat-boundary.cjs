// A completed item operation does not authorize a review transition. Scripted
// model proposals use real page callbacks, approval cards and IndexedDB.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
let browser;
async function open(native) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(fixture, { nativeToolUse: native, legacyArguments: true });
  const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    let serial = 0;
    fixture.call = (name, args) => ({ type: 'tool-call', value: new LanguageModelToolCall({ callId: `boundary-${++serial}`, name, arguments: args }) });
  });
  return { context, page };
}
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); }
async function data(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return { items: await read(db, 'items'), review: await read(db, 'reviews', 'weekly') }; } finally { db.close(); } }); }
async function start(page, native) {
  await page.evaluate(native => fixture.responses.push(...(native ? [[fixture.call('weekly_review', { action: 'start' })], { message: 'Ready.' }] : ['"weekly_review"', '{"action":"start"}'])), native);
  await send(page, 'Start my weekly review.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
  assert.equal((await data(page)).review.index, 0);
}
async function freshAdvance(page, native) {
  await page.evaluate(native => fixture.responses.push(...(native ? [[fixture.call('weekly_review', { action: 'complete_step' })], { message: 'Next.' }] : ['"weekly_review"', '{"action":"complete_step"}'])), native);
  await send(page, 'I have collected my loose notes. That step is complete; move on.');
  await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor();
  assert.equal((await data(page)).review.index, 0, 'A fresh user request still requires its own review confirmation');
  await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
  assert.equal((await data(page)).review.index, 1);
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const write of ['capture_tasks', 'create_item']) {
    const { context, page } = await open(false); await start(page, false);
    const args = write === 'capture_tasks' ? { titles: ['Saved item boundary'] } : { title: 'Saved item boundary' };
    await page.evaluate(({ write, args }) => fixture.responses.push(JSON.stringify(write), JSON.stringify(args), '"weekly_review"', '{"action":"complete_step"}'), { write, args });
    await send(page, 'Capture saved item boundary in Inbox.'); await idle(page);
    const saved = await data(page); assert.equal(saved.items.length, 1); assert.equal(saved.review.index, 0); assert.deepEqual(saved.review.completed, []);
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['weekly_review', write]);
    const last = await page.evaluate(() => fixture.prompts.at(-1));
    assert.equal(last.stage, 'route'); assert.equal(last.responseConstraint.enum.includes('weekly_review'), false);
    assert.equal(last.input.tools.some(tool => tool.name === 'weekly_review'), false, 'Post-write routing exposes no review-control tool');
    assert.equal(await page.locator('#approval').isVisible(), false, 'Ignoring the restricted enum cannot produce a review card');
    if (write === 'capture_tasks') assert.match(await page.locator('#chat').innerText(), /Captured 1 new task/);
    // The rejected raw route left an unused arguments fixture in the queue.
    await page.evaluate(() => { fixture.responses = []; }); await freshAdvance(page, false); await context.close();
  }
  for (const write of ['capture_tasks', 'create_item']) for (const queued of [true, false]) {
    const { context, page } = await open(true); await start(page, true);
    await page.evaluate(({ write, queued }) => {
      const args = write === 'capture_tasks' ? { titles: ['Saved native boundary'] } : { title: 'Saved native boundary' };
      const first = fixture.call(write, args), advance = fixture.call('weekly_review', { action: 'complete_step' });
      fixture.blockedIdentity = advance.value.callId;
      fixture.responses.push(...(queued ? [[first, advance]] : [[first], [advance]]), { message: 'FALSE: the review step was completed.' });
    }, { write, queued });
    await send(page, 'Capture saved native boundary in Inbox.'); await idle(page);
    const saved = await data(page); assert.equal(saved.items.length, 1); assert.equal(saved.review.index, 0); assert.deepEqual(saved.review.completed, []);
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['weekly_review', write]);
    assert.equal(await page.locator('#approval').isVisible(), false);
    const feedback = await page.evaluate(() => fixture.prompts.flatMap(prompt => Array.isArray(prompt.messages) ? prompt.messages.flatMap(message => Array.isArray(message.content) ? message.content : []) : []).filter(part => part.type === 'tool-response' && part.value.callId === fixture.blockedIdentity));
    assert.equal(feedback.length, 1, 'Blocked review receives exactly one correlated outcome'); assert.match(feedback[0].value.errorMessage, /review|user request|confirmation/i);
    assert.doesNotMatch(await page.locator('#chat').innerText(), /FALSE: the review step was completed/);
    if (write === 'capture_tasks') assert.match(await page.locator('#chat').innerText(), /Captured 1 new task/);
    await freshAdvance(page, true); await context.close();
  }
  {
    const { context, page } = await open(true); await start(page, true);
    await page.evaluate(() => fixture.responses.push([
      fixture.call('capture_tasks', { titles: ['First remaining thought'] }),
      fixture.call('weekly_review', { action: 'complete_step' }),
      fixture.call('capture_tasks', { titles: ['Second remaining thought'] })
    ], { message: 'FALSE: the review step was completed.' }));
    await send(page, 'Capture first remaining thought and second remaining thought in Inbox.'); await idle(page);
    const saved = await data(page); assert.deepEqual(saved.items.map(item => item.title).sort(), ['First remaining thought', 'Second remaining thought']); assert.equal(saved.review.index, 0);
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['weekly_review', 'capture_tasks', 'capture_tasks']);
    assert.equal(((await page.locator('#chat').innerText()).match(/Captured 1 new task\(s\) in Inbox\./g) || []).length, 2, 'Queued remaining item effects keep both verified receipts');
    assert.doesNotMatch(await page.locator('#chat').innerText(), /FALSE: the review step was completed/); await context.close();
  }
  // An explicit read-then-advance request is still allowed: inspecting a list
  // does not create the item-mutation boundary.
  for (const native of [false, true]) {
    const { context, page } = await open(native); await start(page, native);
    await page.evaluate(native => fixture.responses.push(...(native
      ? [[fixture.call('list_items', { parentId: null }), fixture.call('weekly_review', { action: 'complete_step' })], { message: 'Next.' }]
      : ['"list_items"', '{"parentId":null}', '"weekly_review"', '{"action":"complete_step"}'])), native);
    await send(page, 'Inspect Inbox. My loose notes are collected and this step is done; move on.');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).review.index, 1); assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['weekly_review', 'list_items', 'weekly_review']);
    await context.close();
  }
  await browser.close(); console.log('Review chat boundary passed: bridge and queued/later native review controls cannot follow item writes, correlated feedback cannot claim advancement, fresh confirmed requests and read-then-review remain available.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

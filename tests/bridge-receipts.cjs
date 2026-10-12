const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
let browser;
async function open(options = {}) { const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options); const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765'); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); return { context, page }; }
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); }
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function data(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); try { return await read(db, 'items'); } finally { db.close(); } }); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const continuation of ['repeat', 'inference-error']) {
    const { context, page } = await open();
    const original = 'Capture exact titles: "Committed once" in Inbox.';
    await page.evaluate(continuation => fixture.responses.push('"capture_tasks"', '{"titles":["Committed once"]}', ...(continuation === 'repeat' ? ['"capture_tasks"', '{"titles":["Committed once"]}'] : [{ error: 'Post-commit route inference failed' }])), continuation);
    await send(page, original); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 1); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    const messages = await page.locator('.message.assistant').allTextContents();
    assert.equal(messages.filter(message => message.includes('Captured 1 new task(s) in Inbox.')).length, 1, 'Verified capture receipt is shown exactly once before the later failure');
    assert(messages.some(message => message.includes(continuation === 'repeat' ? 'Stopped a repeated proposal' : 'Post-commit route inference failed')));
    if (continuation === 'repeat') assert.doesNotMatch(await page.locator('#status').innerText(), /Request failed/);
    assert.equal(await page.locator('#retry-message').isVisible(), false);
    const prompt = await page.evaluate(() => fixture.prompts[2]);
    assert.equal(prompt.stage, 'route'); assert.equal(prompt.messages[0].content, original);
    assert.equal(JSON.parse(prompt.messages[1].content).DATA.toolResults[0].result.ok, true);
    assert.match(prompt.messages.at(-1).content, /Continue from the verified results/); assert.match(prompt.messages.at(-1).content, /Select respond when the request is complete/);
    assert.notEqual(prompt.messages.at(-1).content, original, 'A fulfilled imperative request is not the last continuation instruction');
    await context.close();
  }
  {
    const { context, page } = await open();
    await page.evaluate(async () => { const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {}); await mutate(db, { kind: 'create', patch: { title: 'Existing next action', description: 'Keep the outcome', context: '@Home' } }); db.close(); fixture.responses.push('"capture_tasks"', '{"titles":["New thought"]}', '"complete_task"', '{"title":"Existing next action"}', '"respond"', '{"message":"Unverified phrasing should be replaced."}'); });
    await send(page, 'Capture New thought in Inbox and complete Existing next action.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    const saved = await data(page); assert.equal(saved.length, 2); assert.equal(saved.find(item => item.title === 'Existing next action').status, 'Completed'); assert.equal(saved.find(item => item.title === 'Existing next action').description, 'Keep the outcome');
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['capture_tasks', 'complete_task']);
    const text = await page.locator('#chat').innerText(); assert.match(text, /Captured 1 new task\(s\) in Inbox/); assert.match(text, /Existing next action.*Completed/); assert.doesNotMatch(text, /Unverified phrasing|Request failed/);
    const stages = await page.evaluate(() => fixture.prompts.map(prompt => prompt.stage)); assert.deepEqual(stages, ['route', 'arguments', 'route', 'arguments', 'route', 'respond']);
    await context.close();
  }
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push('"capture_tasks"', '{"titles":["Saved before Stop"]}', { delay: 250, envelope: { message: 'Late acknowledgement', tool: null } }));
    await send(page, 'Capture Saved before Stop in Inbox.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await page.waitForFunction(() => fixture.prompts.length === 3); await page.locator('#stop').click(); await idle(page);
    assert.equal((await data(page)).length, 1); assert.equal((await page.locator('.message.assistant').allTextContents()).filter(message => message.includes('Captured 1 new task(s) in Inbox.')).length, 1);
    await page.waitForTimeout(300);
    assert.equal((await page.locator('.message.assistant').allTextContents()).filter(message => message.includes('Captured 1 new task(s) in Inbox.')).length, 1); assert.doesNotMatch(await page.locator('#chat').innerText(), /Late acknowledgement/);
    await context.close();
  }
  {
    const { context, page } = await open();
    await page.evaluate(async () => { const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {}); await mutate(db, { kind: 'create', patch: { title: 'Finish once' } }); db.close(); fixture.responses.push('"complete_task"', '{"title":"Finish once"}', '"complete_task"', '{"title":"Finish once"}'); });
    await send(page, 'Complete Finish once.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal(await page.evaluate(() => fixture.executions.length), 1); assert.equal((await data(page))[0].status, 'Completed');
    assert.match(await page.locator('#chat').innerText(), /Stopped a repeated proposal/); assert.doesNotMatch(await page.locator('#chat').innerText(), /Request failed|available title choices changed/);
    await context.close();
  }
  {
    const { context, page } = await open({ nativeToolUse: true });
    await page.evaluate(async () => {
      const { openDatabase, mutate } = await import('./storage.js'); const db = await openDatabase(() => {}); await mutate(db, { kind: 'create', patch: { title: 'Native finish once' } }); db.close();
      const call = (callId, name, args) => ({ type: 'tool-call', value: new LanguageModelToolCall({ callId, name, arguments: args }) });
      fixture.responses.push([call('first-complete', 'complete_task', { title: 'Native finish once' })], [call('repeat-complete', 'complete_task', { title: 'Native finish once' }), call('distinct-create', 'create_item', { title: 'Remaining requested item' })], [{ type: 'text', value: 'False acknowledgement should stay hidden.' }]);
    });
    await send(page, 'Complete Native finish once and create Remaining requested item.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.deepEqual(await page.evaluate(() => fixture.executions.map(call => call.name)), ['complete_task', 'create_item']);
    const saved = await data(page); assert.equal(saved.length, 2); assert.equal(saved.find(item => item.title === 'Native finish once').status, 'Completed');
    const feedback = await page.evaluate(() => fixture.prompts.at(-1).messages[0].content.filter(part => part.type === 'tool-response').map(part => ({ id: part.value.callId, error: part.value.errorMessage })));
    assert.deepEqual(feedback.map(part => part.id), ['repeat-complete', 'distinct-create']); assert.match(feedback[0].error, /Skipped an already completed operation/); assert.equal(feedback[1].error, undefined);
    const transcript = await page.locator('#chat').innerText(); assert.match(transcript, /Native finish once.*Completed/); assert.match(transcript, /Saved “Remaining requested item”/); assert.match(transcript, /Stopped a repeated proposal/); assert.doesNotMatch(transcript, /False acknowledgement|Request failed/); assert.equal(await page.locator('#retry-message').isVisible(), false);
    await context.close();
  }
  {
    const { context, page } = await open({ nativeToolUse: true });
    await page.evaluate(() => fixture.responses.push([{ type: 'tool-call', value: new LanguageModelToolCall({ callId: 'review-start', name: 'weekly_review', arguments: { action: 'start' } }) }], { error: 'Review acknowledgement failed' }));
    await send(page, 'Start my weekly review.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    const messages = await page.locator('.message.assistant').allTextContents(); assert.equal(messages.filter(message => message.includes('Weekly review started.')).length, 1, 'An already reported weekly receipt is not repeated in the error handler'); assert(messages.some(message => message.includes('Review acknowledgement failed'))); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    await context.close();
  }
  await browser.close(); console.log('Bridge receipts passed: result-last continuation, saved receipt before repeat/inference errors, compound workflows, and no duplicate weekly receipt.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

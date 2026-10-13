// The alternate proposal format is allowed only before a first native inference
// produced calls. These are isolated model/WebMCP doubles with real IndexedDB.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
async function open() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(fixture, { nativeToolUse: true, legacyArguments: true });
  const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
  await page.evaluate(() => {
    let serial = 0;
    fixture.call = (name, args) => [{ type: 'tool-call', value: new LanguageModelToolCall({ callId: `fallback-${++serial}`, name, arguments: args }) }];
  });
  return { context, page };
}
async function send(page, text) { await page.locator('#message').fill(text); await page.locator('#send').click(); }
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function data(page) {
  return page.evaluate(async () => {
    const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
    try { return await read(db, 'items'); } finally { db.close(); }
  });
}
async function diagnostics(page) {
  await page.locator('#tools-button').click();
  return JSON.parse(await page.locator('#content > pre').first().innerText());
}
async function noFallback(page, expectedCreates) {
  const info = await diagnostics(page);
  assert(['Native Prompt API tool calls', 'Constrained JSON bridge'].includes(info.modelToolLoop)); // Contract failures invalidate native readiness for future requests.
  assert.equal(info.nativeProposalFailure, null);
  assert.equal(await page.evaluate(() => fixture.creates), expectedCreates + 1);
  assert.equal(await page.evaluate(() => fixture.prompts.some(prompt => prompt.constrained)), false);
}
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  // A rejected initial proposal switches exactly once, keeping real approvals
  // and the authoritative capture transaction. Later turns stay on this path.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(
      () => { fixture.options.nativeToolUse = false; return { error: 'Native inference failed before dispatch' }; },
      { message: '', tool: { name: 'capture_tasks', arguments: { titles: ['Fallback thought', 'Another thought'], context: '@Home' } } },
      { message: 'Captured.', tool: null }
    ));
    await send(page, 'Capture fallback thought and another thought at home.');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.deepEqual((await data(page)).map(item => item.title).sort(), ['Another thought', 'Fallback thought']);
    assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    assert.deepEqual(await page.evaluate(() => fixture.prompts.map(prompt => prompt.constrained)), [false, true]);
    assert.deepEqual(await page.evaluate(() => fixture.prompts.slice(1).map(prompt => prompt.stage)), ['arguments']);
    let info = await diagnostics(page); assert.equal(info.modelToolLoop, 'Constrained JSON bridge');
    assert.match(info.nativeProposalFailure, /before dispatch/);
    assert.equal(await page.evaluate(() => typeof LanguageModelToolCall), 'function', 'Native classes remain exposed');
    const creates = await page.evaluate(() => fixture.creates);
    assert.equal(await page.evaluate(() => fixture.modelSettings.at(-1).tools), undefined, 'The replacement session is created without native declarations');
    await page.evaluate(() => fixture.responses.push(
      { message: '', tool: { name: 'capture_tasks', arguments: { titles: ['Later bridge thought'] } } },
      { message: 'Captured.', tool: null }
    ));
    await send(page, 'Capture later bridge thought.');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 3);
    assert.equal(await page.evaluate(() => fixture.creates), creates, 'Later turns clone the bridge base session');
    assert.equal(await page.evaluate(() => fixture.prompts.at(-1).constrained), true);
    await context.close();
  }
  // A deliberate format choice is not an inference failure. It preserves both
  // stored records and conversation and waits for a new human request.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(fixture.call('capture_tasks', { titles: ['Keep across manual switch'] }), { message: 'Saved.' }));
    await send(page, 'Capture keep across manual switch.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    const before = await page.evaluate(async () => {
      const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
      try { return { items: await read(db, 'items'), history: await read(db, 'history'), prompts: fixture.prompts.length, executions: fixture.executions.length }; } finally { db.close(); }
    });
    await diagnostics(page); await page.getByRole('button', { name: 'Use JSON proposals', exact: true }).click();
    assert.equal(await page.locator('#workspace').isVisible(), true);
    assert.equal(await page.evaluate(() => fixture.tools.size), 16);
    await page.evaluate(() => { fixture.options.nativeToolUse = false; });
    const after = await page.evaluate(async () => {
      const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {});
      try { return { items: await read(db, 'items'), history: await read(db, 'history'), prompts: fixture.prompts.length, executions: fixture.executions.length }; } finally { db.close(); }
    });
    assert.deepEqual(after, before, 'Manual preparation preserves records/history and performs no inference or tool replay');
    assert.match(await page.locator('#chat').innerText(), /Capture keep across manual switch/);
    assert.equal(await page.evaluate(() => fixture.modelSettings[0].tools), undefined);
    assert.equal(await page.locator('#send').isEnabled(), true);
    const info = await diagnostics(page); assert.equal(info.modelToolLoop, 'Constrained JSON bridge'); assert.equal(info.nativeProposalFailure, null);
    await page.evaluate(() => fixture.responses.push({ message: '', tool: { name: 'capture_tasks', arguments: { titles: ['Manual bridge thought'] } } }, { message: 'Saved.', tool: null }));
    await send(page, 'Capture manual bridge thought.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 2); assert.equal(await page.evaluate(() => fixture.prompts.at(-1).constrained), true);
    await context.close();
  }
  // Failure while preparing the replacement must offer a working startup retry,
  // retain saved data, and never replay the interrupted human request.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(fixture.call('capture_tasks', { titles: ['Saved before model failure'] }), { message: 'Saved.' }));
    await send(page, 'Capture saved before model failure.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    await page.evaluate(() => fixture.responses.push(() => {
      fixture.options.nativeToolUse = false; fixture.options.createError = true;
      return { error: 'First inference failed, then replacement failed' };
    }));
    await send(page, 'Capture an interrupted request.');
    await page.getByRole('heading', { name: 'Local model unavailable', exact: true }).waitFor();
    assert.equal(await page.locator('#workspace').isVisible(), false);
    assert.equal(await page.evaluate(() => fixture.tools.size), 0, 'Recovery closes stale registrations');
    const prompts = await page.evaluate(() => fixture.prompts.length);
    await page.evaluate(() => { fixture.options.createError = false; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page, { resetTrace: false });
    assert.equal(await page.evaluate(() => fixture.prompts.length), prompts, 'Preparation must not replay the failed request');
    assert.equal(await page.evaluate(() => fixture.tools.size), 16);
    assert.deepEqual((await data(page)).map(item => item.title), ['Saved before model failure']);
    const info = await diagnostics(page); assert.equal(info.modelToolLoop, 'Constrained JSON bridge'); assert.match(info.nativeProposalFailure, /First inference failed/);
    await page.evaluate(() => fixture.responses.push({ message: '', tool: { name: 'capture_tasks', arguments: { titles: ['Recovered thought'] } } }, { message: 'Saved.', tool: null }));
    await send(page, 'Capture recovered thought.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 2); assert.equal(await page.evaluate(() => fixture.executions.length), 2);
    await context.close();
  }
  // Even an empty rejection message must latch the alternate proposal format.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(() => { fixture.options.nativeToolUse = false; throw new Error(''); }, { message: 'No operation needed.', tool: null }));
    await send(page, 'Answer without changing anything.'); await idle(page);
    const info = await diagnostics(page); assert.equal(info.modelToolLoop, 'Constrained JSON bridge'); assert.ok(info.nativeProposalFailure.length);
    assert.deepEqual(await page.evaluate(() => fixture.prompts.map(prompt => prompt.constrained)), [false, true, true]);
    assert.equal(await page.evaluate(() => fixture.creates), 4); assert.equal((await data(page)).length, 0);
    await context.close();
  }
  // Post-commit inference failure cannot select another format or repeat work.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(fixture.call('capture_tasks', { titles: ['Exactly once'] }), { error: 'Post-commit feedback failed' }));
    await send(page, 'Capture exactly once.'); await page.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 1); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    await noFallback(page, 2); assert.equal(await page.locator('#retry-message').isVisible(), false);
    await context.close();
  }
  // Denial feedback is another dispatched path, even though it saved nothing.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(fixture.call('capture_tasks', { titles: ['Denied thought'] }), { error: 'Denial feedback failed' }));
    await send(page, 'Capture denied thought.'); await page.getByRole('button', { name: 'Deny', exact: true }).click(); await idle(page);
    assert.equal((await data(page)).length, 0); assert.equal(await page.evaluate(() => fixture.executions.length), 1);
    await noFallback(page, 2); await context.close();
  }
  // A backend cancellation must not turn into a new inference attempt.
  {
    const { context, page } = await open();
    await page.evaluate(() => fixture.responses.push(() => { throw new DOMException('Cancelled native inference', 'AbortError'); }));
    await send(page, 'Capture nothing after cancellation.'); await idle(page);
    assert.equal((await data(page)).length, 0); assert.equal(await page.evaluate(() => fixture.executions.length), 0);
    await noFallback(page, 2); await context.close();
  }
  // An engine which ignores the signal and rejects late cannot defeat Stop.
  {
    const { context, page } = await open();
    await page.evaluate(() => {
      const create = LanguageModel.create;
      LanguageModel.create = async settings => {
        const session = await create(settings), prompt = session.prompt;
        session.prompt = async (...args) => {
          fixture.delayedPromptStarted = true;
          await new Promise(resolve => setTimeout(resolve, 250));
          return prompt(...args);
        };
        return session;
      };
      fixture.responses.push({ error: 'Late failure after Stop' });
    });
    await send(page, 'Stop this pending inference.'); await page.waitForFunction(() => fixture.delayedPromptStarted);
    await page.locator('#stop').click(); await page.waitForFunction(() => fixture.prompts.length === 1); await idle(page);
    assert.equal((await data(page)).length, 0); assert.equal(await page.evaluate(() => fixture.executions.length), 0);
    await noFallback(page, 2); await context.close();
  }
  // A resumed six-call turn is not a fresh request, despite a zero local count.
  {
    const { context, page } = await open();
    await page.evaluate(() => { for (let n = 0; n < 7; n++) fixture.responses.push(fixture.call('list_items', { search: `distinct-query-${n}` })); });
    await send(page, Array.from({length:7},(_,index)=>`List items matching distinct-query-${index}`).join(' and ')+'.'); await page.getByRole('button', { name: 'Allow for this chat', exact: true }).click(); await idle(page);
    assert.equal(await page.evaluate(() => fixture.executions.length), 6);
    await page.evaluate(() => fixture.responses = [{ error: 'Resumed inference failure' }]);
    await page.locator('#continue-message').click(); await idle(page);
    assert.equal(await page.evaluate(() => fixture.executions.length), 6); assert.equal((await data(page)).length, 0);
    const info = await diagnostics(page); assert.equal(info.nativeProposalFailure, null); assert.equal(await page.evaluate(() => fixture.prompts.some(prompt => prompt.constrained)), false); await context.close();
  }
  await browser.close();
  console.log('Native proposal fallback passed: initial and manual format switch with approval, bridge reuse, saved-history preservation, replacement-session recovery without replay, empty rejection handling, no switch after dispatch, denial, AbortError, Stop or resumed continuation.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

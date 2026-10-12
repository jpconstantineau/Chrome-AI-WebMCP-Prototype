const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
async function idle(page) { await page.waitForFunction(() => !document.querySelector('#send').disabled); }
async function allow(page, choice = 'Allow once') {
  await page.waitForFunction(() => !document.querySelector('#send').disabled || [...document.querySelectorAll('#approval button')].some(button => button.textContent === 'Allow once'));
  if (!(await page.locator('#send').isEnabled())) await page.getByRole('button', { name: choice, exact: true }).click();
  await idle(page);
}
async function command(page, name, args, text, choice = 'Allow once') {
  await page.evaluate(({ name, args }) => {
    fixture.responses.push(Object.assign(() => {
      const tools = fixture.options.nativeToolUse ? fixture.modelSettings.at(-1).tools : fixture.prompts.at(-1).input.tools;
      if (args.destinationTitle) { args.parentId = tools.find(tool => tool.name === 'organize_tasks').inputSchema.properties.parentId.anyOf.find(branch => branch.enum).enum.find(value => value.includes(`: ${args.destinationTitle} (`)); delete args.destinationTitle; }
      return fixture.call(name, args);
    }, { route: name }));
    if (name !== 'weekly_review' || fixture.options.nativeToolUse) fixture.responses.push(fixture.answer('Unverified model acknowledgement.'));
  }, { name, args });
  await page.locator('#message').fill(text); await page.locator('#send').click(); if (name === 'weekly_review' && ['complete_step', 'skip_step'].includes(args.action)) await page.getByRole('button', { name: 'Allow once', exact: true }).waitFor({ state: 'visible' }); await allow(page, choice);
  assert.doesNotMatch(await page.locator('#status').innerText(), /Request failed/);
}
async function data(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const items = await read(db, 'items'), review = await read(db, 'reviews', 'weekly'); db.close(); return { items, review }; }); }
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const options of [{ legacyArguments: true }, { nativeToolUse: true, legacyArguments: true, idKey: 'callID' }, { nativeToolUse: true, idKey: 'callId' }]) {
    const context = await browser.newContext({ serviceWorkers: 'block' }); await context.addInitScript(fixture, options);
    const page = await context.newPage(); await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
    async function ready() {
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
      await page.evaluate(() => {
        let serial = 0;
        fixture.call = (name, args) => fixture.options.nativeToolUse ? [{ type: 'tool-call', value: new LanguageModelToolCall({ [fixture.options.idKey]: `weekly-${++serial}`, name, arguments: args }) }] : { message: '', tool: { name, arguments: args } };
        fixture.answer = message => fixture.options.nativeToolUse ? [{ type: 'text', value: message }] : { message, tool: null };
      });
    }
    await ready();
    await command(page, 'weekly_review', { action: 'start' }, 'Start my weekly review, one step at a time.', 'Allow for this chat');
    assert.match(await page.locator('#review-card').innerText(), /1 \/ 11/);
    await command(page, 'capture_tasks', { titles: ['Compare car insurance', 'Book a test drive', 'Renew passport'], context: '@Home' }, 'Mind dump: compare car insurance, book a test drive and renew passport at home. Capture them in Inbox.');
    assert.equal((await data(page)).items.length, 3); assert.equal((await data(page)).review.index, 0, 'Capturing does not advance the review');
    await command(page, 'weekly_review', { action: 'complete_step' }, 'I collected the loose notes. That step is done; move on.');
    await command(page, 'organize_tasks', { titles: ['Compare car insurance', 'Book a test drive'], newProjectTitle: 'Buy new car' }, 'Put the insurance comparison and test drive under a new Buy new car project.');
    await command(page, 'organize_tasks', { titles: ['Renew passport'], newProjectTitle: 'Travel paperwork' }, 'Move Renew passport under a new Travel paperwork project.');
    assert.equal(await page.locator('.item-row').count(), 0, 'Organized containers do not remain in actionable Inbox');
    assert.match(await page.locator('#rows').innerText(), /0 items/);
    await command(page, 'weekly_review', { action: 'complete_step' }, 'Inbox is clear. Move to the mind dump.');
    await command(page, 'capture_tasks', { titles: ['Chase dealer quote'], context: '@Work' }, 'One more thought: chase the dealer quote at work. Capture it.');
    await command(page, 'organize_tasks', { titles: ['Chase dealer quote'], destinationTitle: 'Buy new car' }, 'Move Chase dealer quote into Buy new car.');
    await command(page, 'weekly_review', { action: 'complete_step' }, 'My head is empty; move on to action lists.');
    await command(page, 'set_task_status', { title: 'Compare car insurance', status: 'In Progress' }, 'I have started comparing car insurance.');
    await command(page, 'complete_task', { title: 'Book a test drive' }, 'I completed booking the test drive.');
    await command(page, 'set_task_status', { title: 'Chase dealer quote', status: 'Waiting For' }, 'I am waiting for the dealer quote.');
    let actual = await data(page), project = actual.items.find(item => item.title === 'Buy new car');
    assert.equal(actual.items.find(item => item.title === 'Compare car insurance').status, 'In Progress');
    assert.equal(actual.items.find(item => item.title === 'Book a test drive').status, 'Completed');
    for (const title of ['Compare car insurance', 'Book a test drive', 'Chase dealer quote']) assert.equal(actual.items.find(item => item.title === title).parentId, project.id);
    assert.equal(actual.items.find(item => item.title === 'Chase dealer quote').context, '@Work');
    await command(page, 'weekly_review', { action: 'complete_step' }, 'My action lists are reviewed. Next step.');
    assert.match(await page.locator('#review-card').innerText(), /No calendar connection/);
    await command(page, 'weekly_review', { action: 'complete_step' }, 'For this test I reviewed my past calendar and there are no follow-ups. Next.');
    await command(page, 'weekly_review', { action: 'complete_step' }, 'My upcoming calendar is reviewed; nothing else to capture. Next.');
    assert.equal(await page.locator('#filter-status').inputValue(), 'Waiting For');
    await command(page, 'weekly_review', { action: 'pause' }, 'Pause my review and save where I am.');
    const paused = (await data(page)).review.index; await page.reload(); await ready();
    assert.equal(await page.evaluate(() => fixture.prompts.length), 0, 'Reload does not replay the model');
    assert.equal((await data(page)).review.index, paused); assert.equal((await data(page)).review.active, false);
    await command(page, 'weekly_review', { action: 'resume' }, 'Resume my weekly review where I left off.');
    const resumeContext = await page.evaluate(() => fixture.prompts[0].input.DATA);
    assert.equal(resumeContext.review.active, false, 'The model sees saved paused progress before proposing resume');
    assert.equal(resumeContext.review.index, paused); assert.equal(resumeContext.reviewStep.title, (await page.evaluate(async index => (await import('./workspace.js')).REVIEW_STEPS[index].title, paused)));
    assert.deepEqual(resumeContext.review.completed, (await data(page)).review.completed);
    for (const text of ['Waiting For is reviewed. Next.', 'The projects are reviewed. Next.', 'My checklists are reviewed. Next.', 'Someday ideas are reviewed. Next.', 'Creative thinking is done. Finish this review.']) await command(page, 'weekly_review', { action: 'complete_step' }, text);
    actual = await data(page); assert.equal(actual.review.index, 11); assert.equal(actual.review.completed.length, 11); assert.equal(actual.review.skipped.length, 0); assert.equal(actual.review.active, false); assert.ok(actual.review.completedAt);
    assert.match(await page.locator('#review-card').innerText(), /Weekly review finished/i);
    assert.equal((await page.locator('#chat').innerText()).includes('Unverified model acknowledgement.'), false);
    await context.close();
  }
  await browser.close(); console.log('Weekly chat passed in all three contracts: eleven steps, atomic mind dump/new projects, moves, statuses, actionable Inbox, factual receipts and pause/reload/resume. Scripted language decisions; native inference needs real Chrome review.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

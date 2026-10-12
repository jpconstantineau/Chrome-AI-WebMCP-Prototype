const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
let browser;
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const legacyArguments of [true, false]) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(fixture, { legacyArguments });
    const page = await context.newPage();
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:8765');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
    await page.evaluate(() => fixture.responses.push({ message: 'Inspecting attributes.', tool: { name: 'list_attributes', arguments: {} } }));
    await page.locator('#message').fill('Inspect attributes.');
    await page.locator('#send').click();
    await page.getByRole('button', { name: 'Deny', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    await page.evaluate(() => fixture.responses.push(
      { message: 'Capturing a test item.', tool: { name: 'create_item', arguments: { title: 'Native contract regression' } } },
      { message: 'The tool confirmed the item was saved.', tool: null }
    ));
    await page.locator('#message').fill('Capture a test item.');
    await page.locator('#send').click();
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    assert.match(await page.locator('#chat').innerText(), /create_item · succeeded/);
    assert.equal(await page.evaluate(() => fixture.executions.filter(call => call.name === 'create_item').length), 1);
    assert.equal(await page.evaluate(() => Object.hasOwn(fixture.prompts[0].input.tools[0], 'inputSchema')), false);
    assert.equal(await page.evaluate(() => fixture.prompts[1].input.tools.length), 1);
    assert.equal(await page.evaluate(() => typeof fixture.prompts[1].input.tools[0].inputSchema), 'object');
    assert.deepEqual(await page.evaluate(() => fixture.prompts[2].input.DATA.toolResults), []);
    assert.equal(await page.evaluate(() => fixture.prompts[2].userMessage), 'Capture a test item.');
    assert.equal(await page.evaluate(() => Object.hasOwn(fixture.prompts[2].input.DATA, 'userRequest')), false);
    assert.match(await page.evaluate(() => fixture.prompts[2].input.instructions), /stopped historical turn does not block this new user request/);
    assert.equal(await page.evaluate(() => fixture.prompts[2].input.DATA.transcript.some(entry => entry.text === 'Inspect attributes.')), false);
    assert.equal(await page.evaluate(() => fixture.prompts[2].input.DATA.transcript.some(entry => entry.text === 'Inspecting attributes.')), false);
    assert.equal(await page.evaluate(() => fixture.prompts[2].input.DATA.transcript.some(entry => entry.role === 'assistant' && entry.text.startsWith('Tool stopped:'))), false);
    assert.match(await page.locator('#chat').innerText(), /Tool stopped: Tool permission denied/);
    assert.equal(await page.evaluate(() => fixture.prompts.at(-1).input.DATA.toolResults[0].result.ok), true);
    assert.equal(await page.evaluate(() => Object.hasOwn(fixture.prompts.at(-1).input, 'tools')), false);
    assert.equal(await page.evaluate(() => fixture.prompts.at(-1).stage), 'respond');
    assert.equal(await page.evaluate(() => fixture.prompts[4].input.tools.every(tool => !Object.hasOwn(tool, 'inputSchema'))), true);
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('#workspace').waitFor({ state: 'visible' }); await configureHarness(page);
    assert.equal(await page.locator('.item-row').filter({ hasText: 'Native contract regression' }).count(), 1);
    assert.match(await page.locator('#chat').innerText(), /Tool stopped: Tool permission denied/);
    await context.close();
  }
  await browser.close();
  console.log('Native contract regression passed: Chrome 154 serialized schemas/arguments and newer object schemas/arguments, one approved execution and persisted item.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });

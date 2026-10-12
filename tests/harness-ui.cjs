// Existing primitive/native fixtures use the same idle-only production controls as a human.
module.exports = async function configureHarness(page, { full = true, native = null, resetTrace = true } = {}) {
  if (native === null) native = await page.evaluate(() => !!fixture.options.nativeToolUse);
  await page.locator('#tools-button').click();
  if (full) await page.locator('#catalog-profile').selectOption('full');
  if (native) {
    await page.getByRole('button', { name: 'Test native tool calls', exact: true }).click();
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    await page.getByRole('button', { name: 'Use native proposals', exact: true }).click();
  }
  if (resetTrace) await page.evaluate(() => { fixture.prompts = []; fixture.executions = []; fixture.canaryInProgress = false; });
  if (await page.locator('.mobile-tabs button[data-panel="navigation"]').isVisible()) await page.locator('.mobile-tabs button[data-panel="navigation"]').click();
  await page.locator('#navigation').getByRole('button', { name: 'Inbox', exact: true }).click();
};

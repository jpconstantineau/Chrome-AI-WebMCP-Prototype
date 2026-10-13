// Workflow tests formerly relied on a grant for every tool in a chat. Their
// simulated human now approves each newly used tool through the visible UI.
// Permission/revocation tests use explicit decisions rather than this helper.
module.exports = async page => {
  for (let decisions = 0; decisions < 20; decisions++) {
    await page.waitForFunction(() => !document.querySelector('#send').disabled || [...document.querySelectorAll('#approval button')].some(button => button.textContent === 'Allow once'));
    if (await page.locator('#send').isEnabled()) return;
    await page.locator('#approval').getByRole('button', { name: 'Allow once', exact: true }).click();
  }
  throw new Error('Too many permission decisions in the expected test turn');
};

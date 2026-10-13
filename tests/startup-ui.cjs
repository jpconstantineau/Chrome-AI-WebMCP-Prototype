// First visits use Continue; returning visits reconnect an installed model.
module.exports = async page => {
  await page.waitForFunction(() => !document.querySelector('#workspace').hidden || [...document.querySelectorAll('#startup-actions button')].some(button => button.textContent === 'Continue'));
  if (await page.locator('#startup').isVisible()) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
};

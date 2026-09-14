import { test, expect, openApp, activeTab } from '../support/fixtures';

// On a deployment with baked-in keys the page renders them into the header inputs,
// so keep them out of traces, screenshots and the failure page snapshot.
test.use({ seedKeys: false, trace: 'off', screenshot: 'off' });

test('first visit asks for a key and blocks generation instead of using a built-in one', async ({ page }) => {
  await openApp(page);

  // If this fails, API keys were compiled into the public bundle (vite.config.ts `define`).
  const prefilled: string[] = [];
  for (const placeholder of ['OpenRouter Key', 'Replicate Token']) {
    const input = page.getByPlaceholder(placeholder);
    if ((await input.inputValue()).length > 0) prefilled.push(placeholder);
    await input.fill(''); // scrub before any assertion can snapshot the page
  }
  expect(prefilled, 'fields prefilled with keys shipped in the public bundle').toEqual([]);

  await expect(activeTab(page).getByText('Please enter your OpenRouter API Key in the header to start generating.')).toBeVisible();
  await activeTab(page).getByPlaceholder('e.g. A futuristic city').fill('Nursery with moon wallpaper');
  await activeTab(page).getByRole('button', { name: /Next Step: Add Reference/ }).click();
  await expect(activeTab(page).getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
});

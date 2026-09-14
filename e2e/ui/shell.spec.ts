import { test, expect, openApp, switchTab, activeTab, providerSelect, FAKE_KEYS } from '../support/fixtures';

test.describe('App shell', () => {
  test('loads without runtime errors and every tab opens its tool', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await openApp(page);
    await expect(activeTab(page).getByRole('heading', { name: 'AI Image Generation' })).toBeVisible();

    const tools = [
      ['Batch', 'Batch Generator'],
      ['Cropper', 'Etsy Image Cropper'],
      ['Upscale', '🔬 AI Upscaler'],
      ['Video', '🎬 Video Animator'],
      ['Generator', 'AI Image Generation'],
    ] as const;
    for (const [tab, heading] of tools) {
      await switchTab(page, tab);
      await expect(activeTab(page).getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('main > div[style*="display: block"]')).toHaveCount(1);
    }

    expect(errors, 'console errors / uncaught exceptions').toEqual([]);
  });

  test('provider choice and API keys survive a reload', async ({ page }) => {
    await openApp(page);
    await expect(providerSelect(page)).toHaveValue('openrouter');

    await providerSelect(page).selectOption('gemini');
    const keyInput = page.getByPlaceholder('Gemini Key');
    await keyInput.fill('AIzaE2E-typed-by-user');
    await page.getByPlaceholder('Replicate Token').fill('r8_e2e_typed_by_user');

    await page.reload();

    await expect(providerSelect(page)).toHaveValue('gemini');
    await expect(page.getByPlaceholder('Gemini Key')).toHaveValue('AIzaE2E-typed-by-user');
    await expect(page.getByPlaceholder('Replicate Token')).toHaveValue('r8_e2e_typed_by_user');
    // Switching back shows the untouched OpenRouter key again.
    await providerSelect(page).selectOption('openrouter');
    await expect(page.getByPlaceholder('OpenRouter Key')).toHaveValue(FAKE_KEYS.openrouter);
  });
});

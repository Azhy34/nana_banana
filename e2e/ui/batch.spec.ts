import type { Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import {
  test,
  expect,
  openApp,
  switchTab,
  activeTab,
  makePng,
  pngDataUrl,
  pngFile,
  expectImageSrc,
  COLORS,
  type MockedApis,
} from '../support/fixtures';

/** A distinct colour per generated card, so each result can be traced. */
const cardImage = (n: number) => pngDataUrl([40 + n * 30, 120, 200 - n * 20]);

async function runBatch(page: Page, apis: MockedApis, count = 6) {
  await openApp(page);
  await switchTab(page, 'Batch');
  const tab = activeTab(page);

  await tab.locator('input[type="file"]').setInputFiles(pngFile('wallpaper.png', COLORS.blue, 320, 240));
  await expect(tab.getByText('✓ Wallpaper loaded')).toBeVisible();
  await tab.getByRole('button', { name: String(count), exact: true }).click();
  await tab.getByRole('button', { name: `🎲 Generate Prompts (${count})` }).click();

  await expect(tab.getByRole('heading', { name: 'Review Prompts' })).toBeVisible();
  await tab.getByRole('button', { name: `▶ Generate All ${count} Photos` }).click();

  await expect(tab.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(tab.getByText(`${count} of ${count} generated`)).toBeVisible({ timeout: 30_000 });
  return tab;
}

test.describe('Batch generator', () => {
  test('wallpaper → prompts → parallel generation with the documented request', async ({ page, apis }) => {
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 300));
      inFlight--;
      return route.fallback(); // hand over to the fixture mock, which records the call
    });
    apis.imageFor = cardImage;

    const tab = await runBatch(page, apis, 6);

    expect(apis.openrouter).toHaveLength(6);
    expect(maxInFlight, 'batch must not exceed its concurrency limit of 2').toBeLessThanOrEqual(2);
    const aspectRatios = apis.openrouter.map((call) => call.body.image_config.aspect_ratio);
    for (const call of apis.openrouter) {
      expect(call.body).toMatchObject({ model: 'google/gemini-3.1-flash-image', image_config: { image_size: '2K' } });
      const parts = call.body.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
      expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(1);
    }
    expect(aspectRatios.every((ar: string) => ['9:16', '2:3', '4:3'].includes(ar))).toBe(true);

    for (let i = 0; i < 6; i++) await expect(tab.getByAltText(`Result ${i + 1}`)).toBeVisible();
    await expect.poll(() => apis.logEvents.filter((e) => e.status === 'success').length).toBe(6);
  });

  test('"↑ Scale" sends that card\'s image to the Upscaler', async ({ page, apis }) => {
    apis.imageFor = cardImage;
    const tab = await runBatch(page, apis, 6);

    const firstResult = await tab.getByAltText('Result 1').getAttribute('src');
    await tab.getByTitle('Send to Upscaler').first().click();

    await expectImageSrc(activeTab(page).getByAltText('Source'), firstResult!, 'upscaler did not receive the batch image');
  });

  test('9:16 card is sent to the Video animator', async ({ page, apis }) => {
    apis.imageFor = cardImage;
    const tab = await runBatch(page, apis, 6);

    const verticalCard = tab.getByTitle('Анимировать пролет камеры (Veo 3.1)').first();
    const cardRoot = verticalCard.locator('xpath=ancestor::div[.//img[starts-with(@alt, "Result ")]][1]');
    const imageSrc = await cardRoot.locator('img[alt^="Result "]').getAttribute('src');
    await verticalCard.click();

    await expect(activeTab(page).getByRole('heading', { name: '🎬 Video Animator' })).toBeVisible();
    await expectImageSrc(activeTab(page).getByAltText('Reference Frame'), imageSrc!, 'video tool did not receive the 9:16 card image');
  });

  test('finished results survive a reload without stuck "Generating..." cards', async ({ page, apis }) => {
    // Real 2K outputs are several MB of base64 each — the size that matters for localStorage.
    const realistic = (n: number) =>
      `data:image/png;base64,${Buffer.concat([makePng(64, 48, [40 + n * 30, 90, 160]), randomBytes(1_900_000)]).toString('base64')}`;
    apis.imageFor = realistic;
    await runBatch(page, apis, 6);

    await page.reload();
    await switchTab(page, 'Batch');
    const tab = activeTab(page);
    await expect(tab.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(tab.getByText('Generating...'), 'cards restored in a loading state that nothing will ever finish').toHaveCount(0);
  });
});

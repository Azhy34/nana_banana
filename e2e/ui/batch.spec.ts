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

async function mockKieBatch(
  page: Page,
  imageFactory: (n: number) => string = cardImage,
  onCreate?: (body: any) => Promise<void> | void,
) {
  await page.addInitScript(() => localStorage.setItem('kie_api_key', 'kie_test_key_12345'));
  let seq = 0;
  const taskImages = new Map<string, string>();
  const kieCreates: any[] = [];
  await page.route('/api/kie', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'upload') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { downloadUrl: 'https://tempfile.aiquickdraw.com/ref.jpg' } }) });
    }
    if (body.action === 'createTask') {
      kieCreates.push(body);
      if (onCreate) await onCreate(body);
      const n = ++seq;
      const taskId = `kie_batch_task_${n}`;
      taskImages.set(taskId, imageFactory(n));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { taskId } }) });
    }
    if (body.action === 'recordInfo') {
      const img = taskImages.get(body.taskId) ?? imageFactory(1);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: { state: 'success', costTime: 5, consumeCredits: 6, resultJson: JSON.stringify({ resultUrls: [img] }) },
        }),
      });
    }
    return route.fallback();
  });
  return kieCreates;
}

async function runBatch(
  page: Page,
  _apis: MockedApis,
  count = 6,
  imageFactory: (n: number) => string = cardImage,
  onCreate?: (body: any) => Promise<void> | void,
) {
  const kieCreates = await mockKieBatch(page, imageFactory, onCreate);
  await openApp(page);
  await switchTab(page, 'Batch');
  const tab = activeTab(page);

  await tab.locator('input[type="file"]').setInputFiles(pngFile('wallpaper.png', COLORS.blue, 320, 240));
  await expect(tab.getByText('✓ Wallpaper loaded')).toBeVisible();
  await tab.getByRole('button', { name: String(count), exact: true }).click();
  await tab.getByRole('button', { name: `🎲 Generate Prompts (${count})` }).click();

  await expect(tab.getByRole('heading', { name: 'Review Prompts' })).toBeVisible();
  const expectedRandomCount = count >= 6 ? 2 : count >= 2 ? 1 : 0;
  await expect(tab.getByText('🎲 AI Рандом (под обои)', { exact: true })).toHaveCount(expectedRandomCount);
  await tab.getByRole('button', { name: `▶ Generate All ${count} Photos` }).click();

  await expect(tab.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(tab.getByText(`${count} of ${count} generated`)).toBeVisible({ timeout: 30_000 });
  await expect(tab.getByLabel('Формат выгрузки')).toHaveValue('pack_4x5_2x3');
  return { tab, kieCreates };
}

test.describe('Batch generator', () => {
  test('wallpaper → prompts → parallel generation with the documented request', async ({ page, apis }) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { tab, kieCreates } = await runBatch(page, apis, 6, cardImage, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 150));
      inFlight--;
    });

    expect(kieCreates).toHaveLength(6);
    expect(maxInFlight, 'batch must not exceed its concurrency limit of 4').toBeLessThanOrEqual(4);
    const aspectRatios = kieCreates.map((call) => call.input.aspect_ratio);
    for (const call of kieCreates) {
      expect(call.model).toBe('nano-banana-2-1');
      expect(call.input.resolution).toBe('2K');
    }
    expect(aspectRatios.every((ar: string) => ['2:3', '9:16'].includes(ar))).toBe(true);

    for (let i = 0; i < 6; i++) await expect(tab.getByAltText(`Result ${i + 1}`)).toBeVisible();
    await expect.poll(() => apis.logEvents.filter((e) => e.status === 'success').length).toBe(6);
  });

  test('3 photos: 2x 2:3 photo masters + 1x 9:16 video master, three requests', async ({ page, apis }) => {
    const { tab, kieCreates } = await runBatch(page, apis, 3);

    expect(kieCreates).toHaveLength(3);
    expect(kieCreates.map((call) => call.input.aspect_ratio).sort()).toEqual(['2:3', '2:3', '9:16']);
    for (let i = 0; i < 3; i++) await expect(tab.getByAltText(`Result ${i + 1}`)).toBeVisible();
    await expect.poll(() => apis.logEvents.filter((e) => e.status === 'success').length).toBe(3);
  });

  test('"↑ Scale" sends that card\'s image to the Upscaler', async ({ page, apis }) => {
    const { tab } = await runBatch(page, apis, 6);

    const firstResult = await tab.getByAltText('Result 1').getAttribute('src');
    await tab.getByTitle('Send to Upscaler').first().click();

    await expectImageSrc(activeTab(page).getByAltText('Source'), firstResult!, 'upscaler did not receive the batch image');
  });

  test('9:16 card is sent to the Video animator', async ({ page, apis }) => {
    const { tab } = await runBatch(page, apis, 6);

    const verticalCard = tab.getByTitle('Анимировать кадр (Video Animator)').first();
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
    await runBatch(page, apis, 6, realistic);

    await page.reload();
    await switchTab(page, 'Batch');
    const tab = activeTab(page);
    await expect(tab.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(tab.getByText('Generating...'), 'cards restored in a loading state that nothing will ever finish').toHaveCount(0);
  });

  test('downloads all formats as a single ZIP when "pack_all" is selected', async ({ page, apis }) => {
    const { tab } = await runBatch(page, apis, 3);
    await tab.getByLabel('Формат выгрузки').selectOption('pack_all');
    const downloadPromise = page.waitForEvent('download');
    await tab.getByRole('button', { name: /⬇ Скачать ZIP/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('moonbloom-export-pack_all.zip');
  });
});

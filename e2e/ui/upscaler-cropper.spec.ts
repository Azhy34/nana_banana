import type { Route } from '@playwright/test';
import {
  test,
  expect,
  openApp,
  switchTab,
  activeTab,
  pngFile,
  cropperCanvasRgb,
  closeTo,
  COLORS,
  FAKE_KEYS,
  BLOB_URL,
  UPSCALED_URL,
} from '../support/fixtures';

test.describe('Upscaler', () => {
  test('upload → Vercel Blob → Topaz → result, with the chosen settings', async ({ page, apis }) => {
    await openApp(page);
    await switchTab(page, 'Upscale');
    await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('mural.png', COLORS.blue, 320, 240));
    await expect(activeTab(page).getByAltText('Source')).toBeVisible();

    await activeTab(page).getByRole('button', { name: /^24K/ }).click();
    await activeTab(page).getByRole('button', { name: /Передний план/ }).click();
    await activeTab(page).getByRole('button', { name: /^PNG/ }).click();
    await activeTab(page).getByRole('button', { name: '🚀 Увеличить до 24K' }).click();

    await expect(activeTab(page).locator(`img[src="${UPSCALED_URL}"]`)).toBeVisible();

    // 1. Client token for the direct browser → Blob upload
    expect(apis.upload).toHaveLength(1);
    expect(apis.upload[0].body).toMatchObject({ type: 'blob.generate-client-token' });
    expect(apis.blobPut).toHaveLength(1);
    expect(apis.blobPut[0].method).toBe('PUT');

    // 2. Upscale request: the Blob URL, not a multi-MB data URL, and 24K → 6x
    expect(apis.upscale).toHaveLength(1);
    expect(apis.upscale[0].headers['authorization']).toBe(`Bearer ${FAKE_KEYS.replicate}`);
    expect(apis.upscale[0].body).toEqual({
      image: BLOB_URL,
      upscaleFactor: '6x',
      enhanceModel: 'High Fidelity V2',
      faceEnhance: false,
      outputFormat: 'png',
      subjectDetection: 'Foreground',
    });

    // 3. Polling with the prediction id and the same token
    expect(apis.upscalePoll.length).toBeGreaterThanOrEqual(1);
    expect(new URL(apis.upscalePoll[0].url).searchParams.get('id')).toBe('e2epred1');
    expect(apis.upscalePoll[0].headers['authorization']).toBe(`Bearer ${FAKE_KEYS.replicate}`);
  });

  for (const [size, factor] of [['8K', '2x'], ['16K', '4x']] as const) {
    test(`${size} maps to upscale_factor ${factor}`, async ({ page, apis }) => {
      await openApp(page);
      await switchTab(page, 'Upscale');
      await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('mural.png', COLORS.blue));
      await activeTab(page).getByRole('button', { name: new RegExp(`^${size}`) }).click();
      await activeTab(page).getByRole('button', { name: `🚀 Увеличить до ${size}` }).click();
      await expect(activeTab(page).locator(`img[src="${UPSCALED_URL}"]`)).toBeVisible();
      expect(apis.upscale[0].body.upscaleFactor).toBe(factor);
    });
  }

  test('a server-side validation error is shown, not swallowed', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/upscale',
      (route: Route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid upscale request — upscaleFactor: Invalid option' }),
        }),
    );
    await openApp(page);
    await switchTab(page, 'Upscale');
    await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('mural.png', COLORS.blue));
    await activeTab(page).getByRole('button', { name: /🚀 Увеличить до/ }).click();
    await expect(activeTab(page).getByText(/Invalid upscale request — upscaleFactor/)).toBeVisible();
  });
});

test.describe('Etsy Cropper', () => {
  test('replacing the photo renders the upload into the preview canvas', async ({ page }) => {
    await openApp(page);
    await switchTab(page, 'Cropper');
    await expect(activeTab(page).getByRole('heading', { name: 'Etsy Image Cropper' })).toBeVisible();
    await expect.poll(async () => closeTo(await cropperCanvasRgb(page), COLORS.blue)).toBe(true);

    await activeTab(page).getByRole('button', { name: 'Заменить фото' }).click();
    await expect(activeTab(page).getByRole('heading', { name: 'Загрузите фото для Etsy' })).toBeVisible();
    await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('room.png', COLORS.green, 800, 600));

    await expect(activeTab(page).getByRole('heading', { name: 'Etsy Image Cropper' })).toBeVisible();
    await expect
      .poll(async () => closeTo(await cropperCanvasRgb(page), COLORS.green), {
        message: 'preview (and therefore every exported crop) still uses the previous photo',
      })
      .toBe(true);
  });
});

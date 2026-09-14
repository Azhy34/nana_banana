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

    // 4. Session log: started + success with the real output size, prediction and billing
    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success']);
    const [started, success] = apis.logEvents;
    const expectedDetails = {
      model: 'topazlabs/image-upscale',
      upscaleFactor: '6x',
      enhanceModel: 'High Fidelity V2',
      outputFormat: 'png',
      subjectDetection: 'Foreground',
      inputWidth: 320,
      inputHeight: 240,
      outputWidth: 1920,
      outputHeight: 1440,
    };
    expect(started).toMatchObject({ ...expectedDetails, cost: 0 });
    expect(success).toMatchObject({ ...expectedDetails, predictionId: 'e2epred1', predictTimeSeconds: 12.3, billingUnits: 2 });
    expect(success.prompt).toContain('6x → 1920×1440 (png, Foreground): mural.png');
    expect(success.cost).toBeCloseTo(2 * 0.048, 5);
    expect(success.duration).toBeGreaterThan(0);
    expect(success.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(started.traceId).toBe(success.traceId);
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

  test('a failed Blob upload is shown and logged with its stage', async ({ page, apis }) => {
    await page.route(
      (url) => url.pathname === '/api/upload',
      (route: Route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'missing BLOB_READ_WRITE_TOKEN' }) }),
    );
    await openApp(page);
    await switchTab(page, 'Upscale');
    await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('mural.png', COLORS.blue));
    await activeTab(page).getByRole('button', { name: /🚀 Увеличить до/ }).click();

    await expect(activeTab(page).getByText(/Ошибка загрузки в облако/)).toBeVisible();
    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'error']);
    expect(apis.logEvents[1]).toMatchObject({ model: 'topazlabs/image-upscale', stage: 'upload' });
    expect(apis.logEvents[1].error).toContain('Ошибка загрузки в облако');
    expect(apis.upscale).toHaveLength(0);
  });

  test('a server-side validation error is shown, not swallowed', async ({ page, apis }) => {
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
    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'error']);
    expect(apis.logEvents[1]).toMatchObject({ stage: 'upscale', error: 'Invalid upscale request — upscaleFactor: Invalid option' });
  });
});

test.describe('Etsy Cropper — wall detection', () => {
  async function openWarpPreset(page: import('@playwright/test').Page) {
    await openApp(page);
    await switchTab(page, 'Cropper');
    await activeTab(page).getByRole('button', { name: '🔍 Дополнительные' }).click();
    await activeTab(page).getByRole('button', { name: /Наклон \/ Мокап/ }).first().click();
  }

  test('detected corners are requested as JSON and logged', async ({ page, apis }) => {
    await openWarpPreset(page);

    await expect.poll(() => apis.logEvents.length).toBeGreaterThanOrEqual(1);
    const call = apis.openrouter.find((c) => c.body?.response_format?.type === 'json_object');
    expect(call, 'wall detection request was not sent').toBeTruthy();
    expect(call!.body.model).toBe('google/gemini-3.1-flash-image');
    expect(JSON.stringify(call!.body.messages)).toContain('image_url');

    expect(apis.logEvents.every((e) => e.status === 'success')).toBe(true);
    expect(apis.logEvents[0]).toMatchObject({
      model: 'google/gemini-3.1-flash-image',
      prompt: 'Wall detection → (0.10,0.10) (0.90,0.10) (0.90,0.90) (0.10,0.90)',
    });
  });

  test('a failed detection is logged instead of silently using the full frame', async ({ page, apis }) => {
    await page.route('https://openrouter.ai/api/v1/chat/completions', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
        : route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ error: { message: 'Provider overloaded' } }),
          }),
    );
    await openWarpPreset(page);

    await expect.poll(() => apis.logEvents.map((e) => e.status)).toContain('error');
    expect(apis.logEvents.find((e) => e.status === 'error')).toMatchObject({
      model: 'google/gemini-3.1-flash-image',
      prompt: 'Wall detection failed — full frame used instead',
      error: 'Provider overloaded',
    });
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

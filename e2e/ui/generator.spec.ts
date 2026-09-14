import type { Page } from '@playwright/test';
import {
  test,
  expect,
  openApp,
  switchTab,
  activeTab,
  providerSelect,
  pngDataUrl,
  pngFile,
  cropperCanvasRgb,
  closeTo,
  expectImageSrc,
  COLORS,
  FAKE_KEYS,
  ENHANCED_PROMPT,
} from '../support/fixtures';

const PROMPT = 'Scandinavian nursery with a moon wallpaper mural on the feature wall';

const aspectSelect = (page: Page) =>
  activeTab(page).getByRole('combobox').filter({ has: page.locator('option[value="21:9"]') });
const modelSelect = (page: Page) =>
  activeTab(page).getByRole('combobox').filter({ has: page.locator('option[value="google/gemini-3-pro-image"]') });

async function fillPromptAndContinue(page: Page, prompt = PROMPT) {
  await activeTab(page).getByPlaceholder('e.g. A futuristic city').fill(prompt);
  await activeTab(page).getByRole('button', { name: /Next Step: Add Reference/ }).click();
}

async function generate(page: Page) {
  await activeTab(page).getByRole('button', { name: 'Generate', exact: true }).click();
}

test.describe('Generator — OpenRouter (default provider)', () => {
  test('prompt → reference → result sends the documented request and shows the image', async ({ page, apis }) => {
    apis.imageFor = () => pngDataUrl(COLORS.red);
    await openApp(page);

    await aspectSelect(page).selectOption('3:4');
    await activeTab(page).locator('label').filter({ hasText: /^2K$/ }).click();
    await fillPromptAndContinue(page);

    await activeTab(page).locator('input[type="file"]').setInputFiles(pngFile('wallpaper.png', COLORS.blue, 320, 240));
    await expect(activeTab(page).getByAltText('Uploaded')).toHaveCount(1);

    await generate(page);
    const result = activeTab(page).getByAltText('Generated Result');
    await expect(result).toBeVisible();
    await expectImageSrc(result, pngDataUrl(COLORS.red), 'result is not the image the model returned');
    await expect(activeTab(page).getByText('Cost:')).toBeVisible();

    expect(apis.openrouter).toHaveLength(1);
    const [call] = apis.openrouter;
    expect(call.headers['authorization']).toBe(`Bearer ${FAKE_KEYS.openrouter}`);
    expect(call.body).toMatchObject({
      model: 'google/gemini-3.1-flash-image',
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '3:4', image_size: '2K' },
    });
    const parts = call.body.messages[0].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === 'text')?.text).toContain(PROMPT);
    const images = parts.filter((p) => p.type === 'image_url');
    expect(images).toHaveLength(1);
    // Uploads are re-encoded to JPEG on a canvas before leaving the browser.
    expect(images[0].image_url!.url).toMatch(/^data:image\/jpeg;base64,.{100,}/);

    await expect.poll(() => apis.logEvents.length).toBe(1);
    expect(apis.logEvents[0]).toMatchObject({ status: 'success', model: 'google/gemini-3.1-flash-image', prompt: PROMPT });
    expect(apis.logEvents[0].sessionId).toMatch(/^sess_/);
    expect(apis.logEvents[0].traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  test('a provider error is shown to the user and logged', async ({ page, apis }) => {
    await page.route('https://openrouter.ai/api/v1/chat/completions', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
        : route.fulfill({
            status: 402,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } }),
          }),
    );
    await openApp(page);
    await fillPromptAndContinue(page);
    await generate(page);

    await expect(activeTab(page).getByRole('heading', { name: 'Generation Failed' })).toBeVisible();
    await expect(activeTab(page).getByText('Insufficient credits')).toBeVisible();
    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['error']);
    expect(apis.logEvents[0].error).toBe('Insufficient credits');
  });

  test('✨ Enhance rewrites the prompt through the text model', async ({ page, apis }) => {
    await openApp(page);
    const textarea = activeTab(page).getByPlaceholder('e.g. A futuristic city');
    await textarea.fill('kinderzimmer mond tapete');
    await activeTab(page).getByRole('button', { name: '✨ Enhance' }).click();

    await expect(textarea).toHaveValue(ENHANCED_PROMPT);
    expect(apis.openrouter).toHaveLength(1);
    expect(apis.openrouter[0].body.model).toBe('google/gemini-2.5-flash');
    expect(apis.openrouter[0].body.modalities).toBeUndefined();
  });
});

test.describe('Generator — Gemini API (direct)', () => {
  test('request follows the Gemini image contract', async ({ page, apis }) => {
    apis.imageFor = () => pngDataUrl(COLORS.green);
    await openApp(page);
    await providerSelect(page).selectOption('gemini');

    await modelSelect(page).selectOption('google/gemini-3-pro-image');
    await aspectSelect(page).selectOption('9:16');
    await activeTab(page).locator('label').filter({ hasText: /^4K$/ }).click();
    await fillPromptAndContinue(page);
    await generate(page);

    await expectImageSrc(activeTab(page).getByAltText('Generated Result'), pngDataUrl(COLORS.green), 'result is not the image the model returned');

    expect(apis.openrouter).toHaveLength(0);
    expect(apis.gemini).toHaveLength(1);
    const [call] = apis.gemini;
    expect(call.url).toContain('/v1beta/models/gemini-3-pro-image:generateContent');
    expect(call.headers['x-goog-api-key']).toBe(FAKE_KEYS.gemini);
    expect(call.body.generationConfig.imageConfig).toEqual({ aspectRatio: '9:16', imageSize: '4K' });
    expect(JSON.stringify(call.body.contents)).toContain(PROMPT);
  });

  test('negative prompt (no seams, no tiling) actually reaches the model', async ({ page, apis }) => {
    await openApp(page);
    await providerSelect(page).selectOption('gemini');
    await fillPromptAndContinue(page);
    await generate(page);
    await expect(activeTab(page).getByAltText('Generated Result')).toBeVisible();

    // geminiService puts it in imageConfig.negativePrompt, which @google/genai does not
    // serialise for the Gemini API — so it has to be part of the request some other way.
    const sent = JSON.stringify(apis.gemini[0].body);
    expect(sent, 'GEMINI_NEGATIVE_PROMPT is missing from the outgoing request').toContain('repeating wallpaper patterns');
  });
});

test.describe('Generator → tools hand-off', () => {
  async function generateRedImage(page: Page, apis: { imageFor: (n: number) => string }) {
    apis.imageFor = () => pngDataUrl(COLORS.red, 640, 480);
    await openApp(page);
    await fillPromptAndContinue(page);
    await generate(page);
    await expect(activeTab(page).getByAltText('Generated Result')).toBeVisible();
  }

  test('"✂️ Etsy Cropper" opens the image that was just generated', async ({ page, apis }) => {
    await generateRedImage(page, apis);
    await activeTab(page).getByRole('button', { name: /Etsy Cropper/ }).click();
    await expect(activeTab(page).getByRole('heading', { name: 'Etsy Image Cropper' })).toBeVisible();

    // Placeholder is served blue by the fixtures; the generated image is red.
    await expect
      .poll(async () => closeTo(await cropperCanvasRgb(page), COLORS.red), {
        message: 'cropper still shows its placeholder instead of the generated image',
        timeout: 5_000,
      })
      .toBe(true);
  });

  test('Upscale tab picks up the image that was just generated', async ({ page, apis }) => {
    await generateRedImage(page, apis);
    await switchTab(page, 'Upscale');
    await expectImageSrc(activeTab(page).getByAltText('Source'), pngDataUrl(COLORS.red, 640, 480), 'upscaler did not receive the generated image');
  });
});

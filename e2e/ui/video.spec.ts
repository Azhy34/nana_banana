import type { Page } from '@playwright/test';
import { OMNI_PRESETS, getOmniCostUsd, omniNeedsUriDelivery } from '../../constants';
import { test, expect, openApp, switchTab, activeTab, pngFile, COLORS, FAKE_KEYS } from '../support/fixtures';

const OMNI_BUTTON = '✨ Запустить анимацию обоев (Omni Flash)';
const VEO_BUTTON = '🚀 Запустить анимацию обоев (Veo)';

async function openVideoWithImage(page: Page) {
  await openApp(page);
  await switchTab(page, 'Video');
  await activeTab(page).locator('input[type="file"]').first().setInputFiles(pngFile('room.jpg', COLORS.blue, 360, 640));
  await expect(activeTab(page).getByAltText('Reference Frame')).toBeVisible();
}

test.describe('Video — Gemini Omni 1.2 Flash (default engine)', () => {
  test('image-to-video request follows the Interactions API contract', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();

    await expect(activeTab(page).locator('video')).toHaveAttribute('src', /^blob:/);
    await expect(activeTab(page).getByRole('button', { name: /Скачать готовый видео-пин/ })).toBeVisible();

    expect(apis.omni).toHaveLength(1);
    const [call] = apis.omni;
    expect(new URL(call.url).searchParams.get('key')).toBe(FAKE_KEYS.gemini);
    expect(call.body).toMatchObject({
      model: 'gemini-omni-1.2-flash',
      // duration must be sent: without it Google makes a 10 s clip while the UI and the log say 5 s
      response_format: { type: 'video', resolution: '720p', aspect_ratio: '9:16', duration: '5s' },
      generation_config: { seed: 133466 },                     // the seed of the form is really sent (it was only logged before)
      store: false, stream: false, background: false,          // Google: plain synchronous generation
    });
    expect(call.body.response_format.delivery).toBeUndefined(); // 720p / 5 s comes inline as base64
    expect(call.body.negative_prompt).toBeUndefined();          // Omni has no negative-prompt parameter
    const [image, text] = call.body.input;
    expect(image.type).toBe('image');
    expect(image.data).toMatch(/^[A-Za-z0-9+/=]{100,}$/); // raw base64, prefix stripped
    expect(text).toEqual({ type: 'text', text: OMNI_PRESETS.omni_wall_dolly.prompt });

    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success']);
    expect(apis.logEvents[1]).toMatchObject({ model: 'gemini-omni-1.2-flash', resolution: '720p' });
  });

  test('fixed 5s duration is sent to Omni and priced accurately', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await expect(activeTab(page).getByText('5 секунд', { exact: true })).toBeVisible();
    await expect(activeTab(page).getByText('$0.35', { exact: true })).toBeVisible();
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).locator('video')).toBeVisible();
    expect(apis.omni[0].body.response_format.duration).toBe('5s');
    expect(apis.omni[0].body.response_format.delivery).toBeUndefined();
  });

  test('1080p is delivered through the Files API (uri), not inline', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: /1080p Рекомендовано Etsy/ }).click();
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).locator('video')).toHaveAttribute('src', /^blob:/);
    expect(apis.omni[0].body.response_format).toMatchObject({ resolution: '1080p', duration: '5s', delivery: 'uri' });
    expect(apis.omniFiles).toHaveLength(1);                          // the file was polled until ACTIVE before the download
  });

  test('the presets follow the Omni prompt guide', async () => {
    for (const [key, preset] of Object.entries(OMNI_PRESETS)) {
      expect(preset.prompt, key).toContain('single continuous shot with no scene cuts');  // by default Omni cuts several shots
      expect(preset.prompt, key).toContain('No dialogue');                                  // the audio is described
      expect(preset.prompt, key).not.toMatch(/ABSOLUTE PRESERVATION|INANIMATE 2D/);          // no shouting, no re-description of the room
    }
    expect(omniNeedsUriDelivery('720p', 5)).toBe(false);
    expect(omniNeedsUriDelivery('1080p', 5)).toBe(true);
    expect(omniNeedsUriDelivery('720p', 15)).toBe(true);
    expect(getOmniCostUsd('720p', 5)).toBeCloseTo(0.3475, 4);     // Google: about $0.07 per second at 720p
    expect(getOmniCostUsd('1080p', 5)).toBeCloseTo(0.5213, 4);
    expect(getOmniCostUsd('360p', 3)).toBeCloseTo(0.0695, 4);
  });

  test('360p draft toggle is sent as the resolution', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: /360p Черновик/ }).click();
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).locator('video')).toBeVisible();
    expect(apis.omni[0].body.response_format.resolution).toBe('360p');
    expect(apis.omni[0].body.response_format.duration).toBe('5s');
  });

  test('an API error is displayed to the user', async ({ page }) => {
    await page.route(/generativelanguage\.googleapis\.com\/v1beta\/interactions/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
        : route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for gemini-omni-1.2-flash' } }),
          }),
    );
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).getByText(/Omni Video generation failed: Quota exceeded/)).toBeVisible();
  });

  test('refuses an OpenRouter key in the Gemini slot before calling anything', async ({ page, apis }) => {
    await page.addInitScript(() => localStorage.setItem('gemini_api_key', 'sk-or-v1-wrong-provider'));
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).getByText(/Ключ не подходит!/)).toBeVisible();
    expect(apis.omni).toHaveLength(0);
  });
});

test.describe('Video — Veo 3.1 Fast', () => {
  test('long-running operation is started, polled and the video is shown', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: 'Veo 3.1 Fast' }).click();
    await activeTab(page).getByRole('button', { name: VEO_BUTTON }).click();

    await expect(activeTab(page).locator('video')).toHaveAttribute('src', /files\/e2e-video:download\?alt=media&key=/, { timeout: 20_000 });

    const [start, ...polls] = apis.veo;
    expect(start.url).toContain('/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning');
    expect(start.headers['x-goog-api-key']).toBe(FAKE_KEYS.gemini);
    expect(start.body.instances[0].image).toMatchObject({ mimeType: expect.stringMatching(/^image\//) });
    expect(start.body.instances[0].image.bytesBase64Encoded.length).toBeGreaterThan(100);
    expect(start.body.parameters).toMatchObject({ aspectRatio: '9:16', durationSeconds: 6, personGeneration: 'allow_adult' });
    expect(start.body.parameters.negativePrompt).toContain('peeling wallpaper');
    expect(start.body.parameters.seed, 'seed is rejected by the Gemini API and must not be sent').toBeUndefined();
    expect(polls.length).toBeGreaterThanOrEqual(1);
  });
});

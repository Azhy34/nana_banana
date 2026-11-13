import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  OMNI_PRESETS, OMNI_PROMPT_BASE, OMNI_PROMPT_FREEZE, OMNI_DURATION_OPTIONS,
  composeOmniPrompt, getOmniCostUsd, omniNeedsUriDelivery,
} from '../../constants';
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
    expect(image.mime_type).toBe('image/png');             // the real type of the upload (it used to be labelled jpeg whatever was uploaded)
    // the form holds the motion only; the request carries opening + motion + wallpaper freeze + sound
    expect(text).toEqual({ type: 'text', text: composeOmniPrompt(OMNI_PRESETS.omni_forward_drift.prompt) });
    expect(text.text).toMatch(/^Use the attached image as the very first frame of the video\. In a single continuous shot/);  // the model reads the picture's role from the text
    expect(text.text).toContain(OMNI_PROMPT_FREEZE);

    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success']);
    expect(apis.logEvents[1]).toMatchObject({ model: 'gemini-omni-1.2-flash', resolution: '720p' });
  });

  test('the request is exactly the one the Pydantic shield is tested with (site_payload.sample.json)', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).locator('video')).toBeVisible();

    const sample = JSON.parse(readFileSync(path.resolve(process.cwd(), 'api_discovery/gemini_omni/site_payload.sample.json'), 'utf-8'));
    delete sample._comment;
    const sent = structuredClone(apis.omni[0].body);
    sent.input[0].data = '<base64 image>';
    sent.input[1].text = '<preset prompt>';
    expect(sent).toEqual(sample);   // api_discovery/gemini_omni/test_models.py validates the same file with the Pydantic models
  });

  test('there is no 360p draft button: only 720p and 1080p are offered', async ({ page }) => {
    await openVideoWithImage(page);
    await expect(activeTab(page).getByRole('button', { name: /360p/ })).toHaveCount(0);
    await expect(activeTab(page).getByRole('button', { name: /720p Финал Etsy/ })).toBeVisible();
    await expect(activeTab(page).getByRole('button', { name: /1080p Рекомендовано Etsy/ })).toBeVisible();
  });

  test('the quality and length buttons show their price (Google token rates x $12 / 1M)', async ({ page }) => {
    await openVideoWithImage(page);
    const tab = activeTab(page);
    await expect(tab.getByRole('button', { name: /720p Финал Etsy.*≈ \$0\.35$/ })).toBeVisible();          // 5 s x 5,792 tokens/s
    await expect(tab.getByRole('button', { name: /1080p Рекомендовано Etsy.*≈ \$0\.52$/ })).toBeVisible();  // 5 s x 8,688 tokens/s
    await expect(tab.getByRole('button', { name: /^3 с.*≈ \$0\.21$/ })).toBeVisible();
    await expect(tab.getByRole('button', { name: /^15 с.*≈ \$1\.04$/ })).toBeVisible();
    await tab.getByRole('button', { name: /1080p Рекомендовано Etsy/ }).click();
    await expect(tab.getByRole('button', { name: /^15 с.*≈ \$1\.56$/ })).toBeVisible();                     // the length prices follow the chosen quality
    await expect(tab.getByRole('button', { name: /720p Финал Etsy.*≈ \$0\.35$/ })).toBeVisible();          // the quality prices follow the chosen length, not the quality
  });

  test('the final cost is the real bill from Google usage', async ({ page }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    const label = activeTab(page).getByText(/Итоговая стоимость/);
    await expect(label).toHaveText('Итоговая стоимость (по счёту Google):');
    await expect(label.locator('xpath=following-sibling::p')).toHaveText('$0.36');   // 30,000 video tokens x $12 / 1M; the price-list estimate would say $0.35
  });

  test('an answer without usage falls back to the price-list estimate and says so', async ({ page, apis }) => {
    apis.omniUsageTokens = null;
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    const label = activeTab(page).getByText(/Итоговая стоимость/);
    await expect(label).toHaveText('Итоговая стоимость (расчёт по прайсу):');
    await expect(label.locator('xpath=following-sibling::p')).toHaveText('$0.35');
  });

  test('an image type Omni does not take is refused before Google is called', async ({ page, apis }) => {
    await openApp(page);
    await switchTab(page, 'Video');
    await activeTab(page).locator('input[type="file"]').first().setInputFiles({ name: 'frame.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).getByText(/Omni принимает кадр в PNG, JPG или WebP/)).toBeVisible();
    expect(apis.omni).toHaveLength(0);
  });

  test('the chosen clip length is sent as the duration and priced per second', async ({ page, apis }) => {
    await openVideoWithImage(page);
    await activeTab(page).getByRole('button', { name: /^8 с/ }).click();
    await expect(activeTab(page).getByText('8 секунд', { exact: true })).toBeVisible();
    await expect(activeTab(page).getByText('$0.56', { exact: true })).toBeVisible();   // 720p: 5,792 tokens/s x 8 s x $12 / 1M = $0.556
    await activeTab(page).getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(activeTab(page).locator('video')).toBeVisible();
    expect(apis.omni[0].body.response_format.duration).toBe('8s');
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

  test('the wallpaper freeze cannot be erased: it is added to whatever the user types', async ({ page, apis }) => {
    await openVideoWithImage(page);
    const tab = activeTab(page);
    await expect(tab.getByTestId('omni-base-prompt')).toContainText(OMNI_PROMPT_FREEZE);   // the owner sees what is always sent
    await tab.getByPlaceholder('Введите или скорректируйте промпт анимации...').fill('The curtains sway in a light breeze.');
    await tab.getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(tab.locator('video')).toBeVisible();
    const sent: string = apis.omni[0].body.input[1].text;
    expect(sent).toBe(composeOmniPrompt('The curtains sway in a light breeze.'));
    for (const sentence of OMNI_PROMPT_BASE) expect(sent).toContain(sentence);
  });

  test('a base sentence typed by the user is not sent twice', async () => {
    const typed = `${OMNI_PROMPT_FREEZE} The camera does not move at all.`;
    expect(composeOmniPrompt(typed).split(OMNI_PROMPT_FREEZE)).toHaveLength(2);
    expect(composeOmniPrompt('  ')).toBe(OMNI_PROMPT_BASE.join(' '));   // an empty field still sends the base
    // a motion typed without a full stop does not run into the next base sentence
    expect(composeOmniPrompt('The camera does not move at all')).toContain(`at all. ${OMNI_PROMPT_FREEZE}`);
    expect(composeOmniPrompt('The camera does not move at all!')).toContain(`at all! ${OMNI_PROMPT_FREEZE}`);
  });

  test('every second from 3 to 10 can be picked, plus the 15 s maximum', async ({ page, apis }) => {
    expect([...OMNI_DURATION_OPTIONS]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 15]);
    await openVideoWithImage(page);
    const tab = activeTab(page);
    for (const seconds of OMNI_DURATION_OPTIONS) await expect(tab.getByRole('button', { name: new RegExp(`^${seconds} с`) })).toBeVisible();
    await tab.getByRole('button', { name: /^7 с/ }).click();
    await expect(tab.getByText('7 секунд', { exact: true })).toBeVisible();
    await tab.getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(tab.locator('video')).toBeVisible();
    expect(apis.omni[0].body.response_format.duration).toBe('7s');
  });

  test('choosing a preset puts its motion into the field and into the request', async ({ page, apis }) => {
    await openVideoWithImage(page);
    const tab = activeTab(page);
    await tab.getByRole('button', { name: /Живой свет, камера стоит/ }).click();
    await expect(tab.getByPlaceholder('Введите или скорректируйте промпт анимации...')).toHaveValue(OMNI_PRESETS.omni_light_only.prompt);
    await tab.getByRole('button', { name: OMNI_BUTTON }).click();
    await expect(tab.locator('video')).toBeVisible();
    expect(apis.omni[0].body.input[1].text).toBe(composeOmniPrompt(OMNI_PRESETS.omni_light_only.prompt));
  });

  test('the presets follow the Omni prompt guide and the owner bans', async () => {
    expect(Object.keys(OMNI_PRESETS)).toEqual(['omni_forward_drift', 'omni_walk_in', 'omni_light_only', 'omni_pull_back', 'omni_texture_light']);
    expect(OMNI_PRESETS.omni_forward_drift.status).toBe('ok');   // the one wording that gave a clean Omni 1.2 clip of ours
    for (const [key, preset] of Object.entries(OMNI_PRESETS)) {
      const sent = composeOmniPrompt(preset.prompt);
      expect(sent, key).toContain('very first frame');                             // the model reads the picture's role from the text
      expect(sent, key).toContain('single continuous shot with no scene cuts');  // by default Omni cuts several shots
      expect(sent, key).toContain('no dialogue');                                  // the audio is described
      expect(sent, key).toContain('stays perfectly still and unchanged');          // the positive wallpaper freeze
      // the motion itself: no base sentence inside (it is added once), no banned move, no noun that may be missing from the frame
      for (const sentence of OMNI_PROMPT_BASE) expect(preset.prompt, key).not.toContain(sentence);
      expect(preset.prompt, key).not.toMatch(/push(es)?[- ]in|zoom|dolly|\bpans?\b|tilt|orbit|glid|slid|crane|tripod|crib|baseboard|very slowly/i);
      expect(preset.prompt, key).not.toMatch(/ABSOLUTE PRESERVATION|INANIMATE 2D/);  // no shouting
      expect(preset.prompt, key).not.toMatch(/[<>"]/);                              // no control tags, no quotation marks
    }
    expect(omniNeedsUriDelivery('720p', 5)).toBe(false);
    expect(omniNeedsUriDelivery('1080p', 5)).toBe(true);
    expect(omniNeedsUriDelivery('720p', 15)).toBe(true);
    expect(getOmniCostUsd('720p', 5)).toBeCloseTo(0.3475, 4);     // Google: about $0.07 per second at 720p
    expect(getOmniCostUsd('1080p', 5)).toBeCloseTo(0.5213, 4);
    expect(getOmniCostUsd('720p', 15)).toBeCloseTo(1.0426, 4);    // 15 s is the new Omni 1.2 maximum
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

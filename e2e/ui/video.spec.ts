import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  OMNI_PRESETS, OMNI_PROMPT_BASE, OMNI_PROMPT_FREEZE,
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

  test('the quality buttons show their 5s price (Google token rates x $12 / 1M)', async ({ page }) => {
    await openVideoWithImage(page);
    const tab = activeTab(page);
    await expect(tab.getByRole('button', { name: /720p Финал Etsy.*≈ \$0\.35$/ })).toBeVisible();          // 5 s x 5,792 tokens/s
    await expect(tab.getByRole('button', { name: /1080p Рекомендовано Etsy.*≈ \$0\.52$/ })).toBeVisible();  // 5 s x 8,688 tokens/s
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
    expect(apis.omni[0].body.store).toBe(true);                       // Google answers 400 to delivery "uri" with store=false
    expect(apis.omniFiles).toHaveLength(1);                          // the file was polled until ACTIVE before the download
  });

  test('the wallpaper freeze cannot be erased: it is added to whatever the user types', async ({ page, apis }) => {
    await openVideoWithImage(page);
    const tab = activeTab(page);
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
    expect(Object.keys(OMNI_PRESETS)).toEqual(['omni_forward_drift', 'omni_walk_in', 'omni_light_only', 'omni_locked_person', 'omni_pull_back', 'omni_texture_light']);
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

test.describe('Video — Kling 3.0 (KIE)', () => {
  test('selects Kling 3.0, switches 720p/1080p price, and submits valid KIE createTask + telemetry', async ({ page, apis }) => {
    await page.addInitScript(() => localStorage.setItem('kie_api_key', 'kie_test_key_12345'));
    const kieCalls: any[] = [];
    await page.route('/api/kie', async (route) => {
      const body = route.request().postDataJSON();
      kieCalls.push(body);
      if (body.action === 'upload') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { downloadUrl: 'https://tempfile.aiquickdraw.com/test_frame.jpg' } }) });
      }
      if (body.action === 'createTask') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { taskId: 'task_kling3_001' } }) });
      }
      if (body.action === 'recordInfo') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              state: 'success',
              costTime: 18,
              consumeCredits: 101,
              resultJson: JSON.stringify({ resultUrls: ['https://tempfile.aiquickdraw.com/kling3_out.mp4'] }),
            },
          }),
        });
      }
      return route.fallback();
    });

    await openVideoWithImage(page);
    const tab = activeTab(page);
    await tab.getByRole('button', { name: /Kling 3\.0 \(KIE\)/ }).click();
    await expect(tab.getByRole('button', { name: /720p Standard/ })).toBeVisible();
    await tab.getByRole('button', { name: /1080p Pro/ }).click();
    await expect(tab.getByText('$0.51').first()).toBeVisible();

    await tab.getByRole('button', { name: /Запустить анимацию обоев \(Kling 3\.0\)/ }).click();
    await expect(tab.locator('video')).toHaveAttribute('src', 'https://tempfile.aiquickdraw.com/kling3_out.mp4', { timeout: 15_000 });

    const createCall = kieCalls.find((c) => c.action === 'createTask');
    expect(createCall).toMatchObject({
      action: 'createTask',
      model: 'kling-3.0/video',
      input: {
        sound: false,
        duration: '5',
        mode: 'pro',
        multi_shots: false,
        image_urls: ['https://tempfile.aiquickdraw.com/test_frame.jpg'],
      },
    });
    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success']);
    expect(apis.logEvents[1]).toMatchObject({
      model: 'kling-3.0/video',
      provider: 'kie',
      kieTaskId: 'task_kling3_001',
      kieCredits: 101,
      serverTimeSeconds: 18,
      costSource: 'credits',
      resolution: '1080p',
    });
  });

  test('upscales generated KIE video to 4K and emits correlated OpenTelemetry trace', async ({ page, apis }) => {
    await page.addInitScript(() => localStorage.setItem('kie_api_key', 'kie_test_key_12345'));
    const kieCalls: any[] = [];
    await page.route('/api/kie', async (route) => {
      const body = route.request().postDataJSON();
      kieCalls.push(body);
      if (body.action === 'upload') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { downloadUrl: 'https://tempfile.aiquickdraw.com/test_frame.jpg' } }) });
      }
      if (body.action === 'createTask') {
        const taskId = body.model === 'video/upscale' ? 'task_upscale_001' : 'task_kling3_001';
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { taskId } }) });
      }
      if (body.action === 'recordInfo') {
        const isUpscale = body.taskId === 'task_upscale_001';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              state: 'success',
              costTime: isUpscale ? 35 : 18,
              consumeCredits: isUpscale ? 30 : 75.5,
              resultJson: JSON.stringify({
                resultUrls: [
                  isUpscale
                    ? 'https://tempfile.aiquickdraw.com/kling3_upscaled_4k.mp4'
                    : 'https://tempfile.aiquickdraw.com/kling3_out.mp4',
                ],
              }),
            },
          }),
        });
      }
      return route.fallback();
    });

    await openVideoWithImage(page);
    const tab = activeTab(page);
    await tab.getByRole('button', { name: /Kling 3\.0 \(KIE\)/ }).click();
    await tab.getByRole('button', { name: /Запустить анимацию обоев \(Kling 3\.0\)/ }).click();
    await expect(tab.locator('video')).toHaveAttribute('src', 'https://tempfile.aiquickdraw.com/kling3_out.mp4', { timeout: 15_000 });

    await tab.getByRole('button', { name: /^4K/ }).click();
    await tab.getByRole('button', { name: /Апскейл до 4K/ }).click();
    await expect(tab.locator('video')).toHaveAttribute('src', 'https://tempfile.aiquickdraw.com/kling3_upscaled_4k.mp4', { timeout: 15_000 });

    const upscaleCall = kieCalls.find((c) => c.action === 'createTask' && c.model === 'video/upscale');
    expect(upscaleCall).toEqual({
      action: 'createTask',
      model: 'video/upscale',
      input: {
        video_url: 'https://tempfile.aiquickdraw.com/kling3_out.mp4',
        resolution: '4K',
      },
    });

    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success', 'started', 'success']);
    const genSuccess = apis.logEvents[1];
    const upscaleSuccess = apis.logEvents[3];
    expect(upscaleSuccess).toMatchObject({
      model: 'video/upscale',
      stage: 'upscale',
      upscaleModel: 'video/upscale',
      provider: 'kie',
      resolution: '4K',
      durationSeconds: 5,
      kieTaskId: 'task_upscale_001',
      kieCredits: 30,
      serverTimeSeconds: 35,
      costSource: 'credits',
    });
    expect(upscaleSuccess.traceId).toBe(genSuccess.traceId);
    expect(upscaleSuccess.spanId).toBeTruthy();
    expect(upscaleSuccess.spanId).not.toBe(genSuccess.spanId);
  });
});

test.describe('Video — On-demand Prompt Adapter (gemini-3.1-flash-lite)', () => {
  test('adapts motion preset for the current frame with thinkingLevel minimal and emits telemetry', async ({ page, apis }) => {
    const adaptRequests: any[] = [];
    await page.route('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent*', async (route) => {
      adaptRequests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    thought: true,
                    text: 'Child has right hand already raised toward a flower; rug is bare.',
                  },
                  {
                    text: 'Locked static camera, zero camera movement, zero handheld shake. The barefoot toddler smoothly shifts their already raised right hand toward the neighboring flower while warm daylight glides softly across the oak floor; no flowers or illustrations move or morph under the hand.',
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 410,
            candidatesTokenCount: 55,
            thoughtsTokenCount: 42,
            totalTokenCount: 507,
          },
        }),
      });
    });

    await openVideoWithImage(page);
    const tab = activeTab(page);
    await tab.getByRole('button', { name: '✨ Адаптировать под фото' }).click();

    await expect(tab.locator('textarea')).toHaveValue(/barefoot toddler smoothly shifts/, { timeout: 10_000 });
    await expect(tab.locator('textarea')).not.toHaveValue(/Child has right hand already raised/);
    await expect(tab.getByText(/Мысли агента: Child has right hand already raised/)).toBeVisible();
    expect(adaptRequests).toHaveLength(1);
    expect(adaptRequests[0].contents[0].parts.some((p: any) => Boolean(p.inlineData?.data))).toBe(true);
    expect(adaptRequests[0].generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'low',
      includeThoughts: true,
    });
    expect(adaptRequests[0].systemInstruction.parts[0].text).toContain('Moonbloom');

    await expect.poll(() => apis.logEvents.map((e) => e.status)).toEqual(['started', 'success']);
    expect(apis.logEvents[1]).toMatchObject({
      model: 'gemini-3.1-flash-lite',
      stage: 'video_prompt_adapt',
      provider: 'gemini',
      promptTokens: 410,
      candidateTokens: 55,
      thoughtsTokens: 42,
      totalTokens: 507,
      agentThoughts: 'Child has right hand already raised toward a flower; rug is bare.',
      costSource: 'usage',
    });
  });
});

import { test as base, expect, type Locator, type Page, type Request, type Route } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';

export { expect };

/** Fake credentials — shaped like the real ones so client-side format checks pass. */
export const FAKE_KEYS = {
  openrouter: 'sk-or-v1-e2e-fake-openrouter-key',
  gemini: 'AIzaE2E-fake-gemini-key',
  replicate: 'r8_e2e_fake_replicate_token',
} as const;

export type Rgb = readonly [number, number, number];
export const COLORS = {
  red: [220, 30, 30],
  blue: [30, 60, 220],
  green: [30, 180, 60],
} as const satisfies Record<string, Rgb>;

/** Minimal solid-colour RGB PNG, so hand-offs between tools can be traced by pixel colour. */
export function makePng(width: number, height: number, [r, g, b]: Rgb): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const pngDataUrl = (rgb: Rgb, width = 64, height = 48) =>
  `data:image/png;base64,${makePng(width, height, rgb).toString('base64')}`;

export const pngFile = (name: string, rgb: Rgb, width = 64, height = 48) => ({
  name,
  mimeType: 'image/png',
  buffer: makePng(width, height, rgb),
});

export interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

export const OMNI_VIDEO_BYTES = Buffer.from('e2e-omni-video');
export const UPSCALED_URL = 'https://replicate.delivery/e2e/upscaled.png';
export const BLOB_URL = 'https://e2estore.public.blob.vercel-storage.com/e2e-source.png';
export const ENHANCED_PROMPT = 'E2E enhanced prompt: Scandinavian nursery, matte moon wallpaper, soft daylight';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

const capture = (request: Request): Captured => {
  let body: any = null;
  try {
    body = request.postDataJSON();
  } catch {
    body = request.postData();
  }
  return { url: request.url(), method: request.method(), headers: request.headers(), body };
};

const json = (route: Route, status: number, data: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(data) });

/** Answers CORS preflight; returns true when the request was one. */
const preflight = async (route: Route) => {
  if (route.request().method() !== 'OPTIONS') return false;
  await route.fulfill({ status: 204, headers: CORS });
  return true;
};

const splitDataUrl = (dataUrl: string) => {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('mock image must be a base64 data URL');
  return { mimeType: match[1], data: match[2] };
};

/**
 * Intercepts every AI provider and backend route the app talks to.
 *
 * A guard is registered first and blocks anything no specific mock handles, so
 * a test can never reach a paid API — and fails if it tried to.
 */
export class MockedApis {
  /** Returns the image for the n-th image generation (0-based). */
  imageFor: (n: number) => string = () => pngDataUrl(COLORS.red);

  readonly openrouter: Captured[] = [];
  readonly gemini: Captured[] = [];
  readonly omni: Captured[] = [];
  readonly veo: Captured[] = [];
  readonly upload: Captured[] = [];
  readonly blobPut: Captured[] = [];
  readonly upscale: Captured[] = [];
  readonly upscalePoll: Captured[] = [];
  readonly logEvents: any[] = [];
  /** Requests that reached the guard, i.e. would have left the browser unmocked. */
  readonly escaped: string[] = [];

  private imagesServed = 0;

  constructor(private readonly page: Page, private readonly appOrigin: string) {}

  private nextImage() {
    return this.imageFor(this.imagesServed++);
  }

  private sameOriginApi(path: string) {
    return (url: URL) => url.origin === this.appOrigin && url.pathname === path;
  }

  async install() {
    const { page } = this;

    const guarded = [
      /^https:\/\/openrouter\.ai\//,
      /^https:\/\/generativelanguage\.googleapis\.com\//,
      /^https:\/\/api\.replicate\.com\//,
      /^https:\/\/vercel\.com\/api\/blob/,
    ];
    const guard = (route: Route) => {
      this.escaped.push(`${route.request().method()} ${route.request().url().split('?')[0]}`);
      return route.abort('blockedbyclient');
    };
    for (const pattern of guarded) await page.route(pattern, guard);
    await page.route((url) => url.origin === this.appOrigin && url.pathname.startsWith('/api/'), guard);

    // ── OpenRouter: image generation, prompt enhancement, wall detection ────────
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
      if (await preflight(route)) return;
      const request = capture(route.request());
      this.openrouter.push(request);
      const body = request.body ?? {};
      if (Array.isArray(body.modalities) && body.modalities.includes('image')) {
        return json(route, 200, {
          choices: [{ message: { role: 'assistant', content: '', images: [{ type: 'image_url', image_url: { url: this.nextImage() } }] } }],
          usage: { prompt_tokens: 1000, completion_tokens: 1290, total_tokens: 2290 },
        });
      }
      if (body.response_format?.type === 'json_object') {
        return json(route, 200, { choices: [{ message: { content: JSON.stringify(WALL) } }] });
      }
      return json(route, 200, { choices: [{ message: { content: ENHANCED_PROMPT } }] });
    });

    // ── Gemini API: generateContent (images, text, wall detection) ──────────────
    await page.route(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:]+:generateContent/, async (route) => {
      if (await preflight(route)) return;
      const request = capture(route.request());
      this.gemini.push(request);
      const config = request.body?.generationConfig ?? {};
      let part: Record<string, unknown>;
      if (config.imageConfig) part = { inlineData: splitDataUrl(this.nextImage()) };
      else if (config.responseMimeType === 'application/json') part = { text: JSON.stringify(WALL) };
      else part = { text: ENHANCED_PROMPT };
      return json(route, 200, {
        candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1290, totalTokenCount: 2290 },
      });
    });

    // ── Gemini Omni: Interactions API ───────────────────────────────────────────
    await page.route(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/interactions/, async (route) => {
      if (await preflight(route)) return;
      const request = capture(route.request());
      this.omni.push(request);
      return json(route, 200, {
        id: 'v1_e2e',
        object: 'interaction',
        status: 'completed',
        model: request.body?.model,
        steps: [
          { type: 'user_input', content: [] },
          { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: OMNI_VIDEO_BYTES.toString('base64') }] },
        ],
      });
    });

    // ── Veo: long-running operation + file download ─────────────────────────────
    await page.route(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/(veo-[^/:]+):predictLongRunning/, async (route) => {
      if (await preflight(route)) return;
      const request = capture(route.request());
      this.veo.push(request);
      const model = /models\/(veo-[^/:]+)/.exec(request.url)![1];
      return json(route, 200, { name: `models/${model}/operations/e2e-op` });
    });
    await page.route(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/veo-[^/]+\/operations\/e2e-op/, async (route) => {
      if (await preflight(route)) return;
      const request = capture(route.request());
      this.veo.push(request);
      return json(route, 200, {
        name: new URL(request.url).pathname.replace('/v1beta/', ''),
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/e2e-video:download?alt=media' } }],
          },
        },
      });
    });
    await page.route(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[^/]+:download/, (route) =>
      route.fulfill({ status: 200, contentType: 'video/mp4', headers: CORS, body: OMNI_VIDEO_BYTES }),
    );

    // ── Backend routes (Vercel functions) ───────────────────────────────────────
    await page.route(this.sameOriginApi('/api/log-event'), async (route) => {
      this.logEvents.push(route.request().postDataJSON());
      return json(route, 200, { success: true });
    });
    await page.route(this.sameOriginApi('/api/upload'), async (route) => {
      this.upload.push(capture(route.request()));
      return json(route, 200, { type: 'blob.generate-client-token', clientToken: 'vercel_blob_client_e2estore_e30=' });
    });
    await page.route(/^https:\/\/vercel\.com\/api\/blob/, async (route) => {
      if (await preflight(route)) return;
      const request = route.request();
      this.blobPut.push({ url: request.url(), method: request.method(), headers: request.headers(), body: null });
      return json(route, 200, {
        url: BLOB_URL,
        downloadUrl: `${BLOB_URL}?download=1`,
        pathname: 'e2e-source.png',
        contentType: 'image/png',
        contentDisposition: 'inline; filename="e2e-source.png"',
      });
    });
    await page.route(this.sameOriginApi('/api/upscale'), async (route) => {
      this.upscale.push(capture(route.request()));
      return json(route, 200, { id: 'e2epred1', status: 'starting', output: null });
    });
    await page.route(this.sameOriginApi('/api/upscale/poll'), async (route) => {
      this.upscalePoll.push(capture(route.request()));
      return json(route, 200, {
        id: 'e2epred1',
        status: 'succeeded',
        output: UPSCALED_URL,
        metrics: { predict_time: 12.3, unspecified_billing_metric: 2 },
      });
    });

    // ── Static images the app loads from third parties ─────────────────────────
    await page.route(UPSCALED_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: makePng(64, 48, COLORS.green) }),
    );
    // EtsyCropper preloads an Unsplash placeholder; serve a known colour instead.
    await page.route(/^https:\/\/images\.unsplash\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: makePng(400, 300, COLORS.blue) }),
    );
  }
}

const WALL = {
  topLeft: { x: 0.1, y: 0.1 },
  topRight: { x: 0.9, y: 0.1 },
  bottomRight: { x: 0.9, y: 0.9 },
  bottomLeft: { x: 0.1, y: 0.9 },
};

type Fixtures = { seedKeys: boolean; apis: MockedApis };

export const test = base.extend<Fixtures>({
  seedKeys: [true, { option: true }],

  // auto: the guard must be in place even in tests that never touch `apis`.
  apis: [
    async ({ page, baseURL, seedKeys }, use) => {
      const apis = new MockedApis(page, new URL(baseURL!).origin);
      await apis.install();
      if (seedKeys) {
        await page.addInitScript((keys) => {
          for (const [name, value] of Object.entries(keys)) {
            if (!localStorage.getItem(name)) localStorage.setItem(name, value);
          }
        }, { openrouter_api_key: FAKE_KEYS.openrouter, gemini_api_key: FAKE_KEYS.gemini, replicate_token: FAKE_KEYS.replicate });
      }
      await use(apis);
      expect(apis.escaped, 'requests to AI providers/backend that no mock handled (blocked)').toEqual([]);
    },
    { auto: true },
  ],
});

// ── Page helpers ───────────────────────────────────────────────────────────────

export type Tab = 'Generator' | 'Batch' | 'Cropper' | 'Upscale' | 'Video';

/** The tab panel currently shown — App keeps every tool mounted and hides the rest. */
export const activeTab = (page: Page): Locator => page.locator('main > div[style*="display: block"]');

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generator', exact: true })).toBeVisible();
}

export async function switchTab(page: Page, tab: Tab) {
  await page.getByRole('button', { name: tab, exact: true }).click();
}

export const providerSelect = (page: Page) =>
  page.getByRole('combobox').filter({ has: page.locator('option[value="openrouter"]') });

/** Samples the cropper preview canvas away from the centre guides. */
export async function cropperCanvasRgb(page: Page): Promise<Rgb> {
  return activeTab(page).locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(Math.floor(canvas.width * 0.42), Math.floor(canvas.height * 0.58), 1, 1);
    return [data[0], data[1], data[2]] as const;
  });
}

export const closeTo = (actual: Rgb, expected: Rgb, tolerance = 45) =>
  actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

/**
 * Asserts an <img> shows exactly `expectedSrc` without dumping multi-KB data URLs
 * into the report when it does not.
 */
export async function expectImageSrc(image: Locator, expectedSrc: string, message: string) {
  await expect(image, message).toBeVisible();
  const actual = (await image.getAttribute('src')) ?? '';
  expect(actual === expectedSrc, `${message} (got src "${actual.slice(0, 40)}…")`).toBe(true);
}

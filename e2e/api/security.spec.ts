import { test, expect } from '@playwright/test';

// Failing responses here carry secrets or every logged prompt — never persist them in a trace.
test.use({ trace: 'off' });

const isLocal = (baseURL?: string) => !baseURL || /localhost|127\.0\.0\.1/.test(baseURL);

const SECRET_PATTERNS: Record<string, RegExp> = {
  'OpenRouter key': /sk-or-v1-[a-f0-9]{20,}/g,
  'Google API key': /AIza[0-9A-Za-z_-]{30,}/g,
  'Replicate token': /r8_[0-9A-Za-z]{20,}/g,
  'Vercel Blob token': /vercel_blob_rw_[0-9A-Za-z_]{20,}/g,
};

const mask = (secret: string) => `${secret.slice(0, 6)}… (${secret.length} chars)`;

test('client JS bundle does not embed provider secrets', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
  expect(scripts.length, 'no bundled scripts found in index.html').toBeGreaterThan(0);

  const leaks: string[] = [];
  for (const src of scripts) {
    const js = await (await request.get(src)).text();
    for (const [name, pattern] of Object.entries(SECRET_PATTERNS)) {
      for (const hit of new Set(js.match(pattern) ?? [])) leaks.push(`${name} ${mask(hit)} in ${src}`);
    }
  }
  expect(leaks, 'secrets readable by every visitor — rotate them and stop inlining via vite `define`').toEqual([]);
});

test.describe('server routes do not expose the owner’s credentials or data', () => {
  test.skip(({ baseURL }) => isLocal(baseURL), '/api/* only exists on a Vercel deployment');

  test('/api/list-sessions is not publicly readable', async ({ request }) => {
    const res = await request.get('/api/list-sessions');
    // Body intentionally not printed: when this fails it contains every logged prompt.
    expect([401, 403, 404], `anonymous GET returned HTTP ${res.status()}`).toContain(res.status());
  });

  test('/api/qwen does not run predictions on the server token for anonymous callers', async ({ request }) => {
    // Empty body: an unprotected route answers 400 "input.prompt is required" without billing anything.
    const res = await request.post('/api/qwen', { data: {} });
    expect([401, 403, 404], `anonymous POST reached input validation (HTTP ${res.status()})`).toContain(res.status());
  });

  test('/api/qwen/poll rejects path traversal in the prediction id', async ({ request }) => {
    // `../x` would be normalised to api.replicate.com/v1/x and fetched with the server token.
    // The probe path does not exist, so a vulnerable route answers with Replicate's 404.
    const res = await request.get('/api/qwen/poll?id=../e2e-traversal-probe');
    const isJson = (res.headers()['content-type'] ?? '').includes('application/json');
    const forwardedToReplicate = isJson && ![400, 401, 403].includes(res.status());
    expect(forwardedToReplicate, `id reached the Replicate URL path (HTTP ${res.status()})`).toBe(false);
  });
});

import { test, expect } from '@playwright/test';

/**
 * Contract checks for the Vercel functions. Every request here is rejected by
 * our own validation or by the provider's auth check, so nothing is ever billed.
 */
const isLocal = (baseURL?: string) => !baseURL || /localhost|127\.0\.0\.1/.test(baseURL);
const FAKE_TOKEN = 'r8_e2e_invalid_token_000000000000000000';

test('SPA shell and client-side routes are served', async ({ request }) => {
  const root = await request.get('/');
  expect(root.status()).toBe(200);
  expect(await root.text()).toContain('<div id="root">');

  const deepLink = await request.get('/some/client/route');
  expect(deepLink.status()).toBe(200);
  expect(await deepLink.text()).toContain('<div id="root">');
});

test.describe('Vercel API routes', () => {
  test.skip(({ baseURL }) => isLocal(baseURL), '/api/* only exists on a Vercel deployment');

  test.describe('/api/upscale', () => {
    test('allows CORS preflight with Authorization', async ({ request }) => {
      const res = await request.fetch('/api/upscale', { method: 'OPTIONS' });
      expect(res.status()).toBe(200);
      expect(res.headers()['access-control-allow-origin']).toBe('*');
      expect(res.headers()['access-control-allow-headers']).toContain('Authorization');
    });

    test('rejects non-POST', async ({ request }) => {
      expect((await request.get('/api/upscale')).status()).toBe(405);
    });

    test('requires a Replicate token', async ({ request }) => {
      const res = await request.post('/api/upscale', { data: { image: 'https://example.com/a.png' } });
      expect(res.status()).toBe(401);
    });

    test('names every invalid field instead of proxying an opaque 422', async ({ request }) => {
      const res = await request.post('/api/upscale', {
        headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
        data: { image: 'ftp://nope', upscaleFactor: '3x', outputFormat: 'tiff', subjectDetection: 'Sky' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      const fields = (body.issues as string[]).map((issue) => issue.split(':')[0]);
      expect(fields).toEqual(expect.arrayContaining(['image', 'upscaleFactor', 'outputFormat', 'subjectDetection']));
    });

    test('a valid body passes validation and reaches Replicate', async ({ request }) => {
      // Invalid token → Replicate refuses before running anything.
      const res = await request.post('/api/upscale', {
        headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
        data: { image: 'https://example.com/a.png', upscaleFactor: '2x', enhanceModel: 'High Fidelity V2', outputFormat: 'jpg', subjectDetection: 'All', faceEnhance: false },
      });
      expect(res.status(), 'expected Replicate auth rejection, not our validation or a crash').toBe(401);
      expect((await res.json()).error).not.toContain('Invalid upscale request');
    });
  });

  test.describe('/api/upscale/poll', () => {
    test('validates the prediction id before building the Replicate URL', async ({ request }) => {
      const headers = { Authorization: `Bearer ${FAKE_TOKEN}` };
      expect((await request.get('/api/upscale/poll', { headers })).status()).toBe(400);
      expect((await request.get('/api/upscale/poll?id=../account', { headers })).status()).toBe(400);
      expect((await request.get('/api/upscale/poll?id=abc123')).status()).toBe(401);
    });

    test('forwards Replicate errors for a well-formed id', async ({ request }) => {
      const res = await request.get('/api/upscale/poll?id=e2enonexistent0000', { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } });
      expect([401, 404]).toContain(res.status());
    });
  });

  test.describe('/api/upload', () => {
    test('rejects non-POST', async ({ request }) => {
      expect((await request.get('/api/upload')).status()).toBe(405);
    });

    test('Blob storage is configured on the server', async ({ request }) => {
      // 500 here means BLOB_READ_WRITE_TOKEN is missing and every upscale upload will fail.
      const res = await request.post('/api/upload', { data: { type: 'e2e-unknown-event' } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('Invalid event type');
    });
  });

  test.describe('/api/log-event', () => {
    test('accepts CORS preflight and rejects non-POST', async ({ request }) => {
      expect((await request.fetch('/api/log-event', { method: 'OPTIONS' })).status()).toBe(200);
      expect((await request.get('/api/log-event')).status()).toBe(405);
    });
  });
});

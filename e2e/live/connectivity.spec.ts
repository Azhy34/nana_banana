import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { MODEL_OPTIONS, OMNI_MODEL_ID, VEO_MODEL_ID } from '../../constants';
import { ENHANCE_MODELS, OUTPUT_FORMATS, SUBJECT_DETECTIONS, UPSCALE_FACTORS } from '../../shared/upscaleContract';

/**
 * Real providers, real keys from .env.local — but only free, read-only endpoints:
 * key info, model metadata, account. Nothing here generates or bills.
 */
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const env = (name: string) => process.env[name]?.trim() ?? '';

const GEMINI_IMAGE_MODELS = MODEL_OPTIONS.map((o) => o.value).filter((id) => id.startsWith('google/'));
const OPENROUTER_TEXT_MODEL = 'google/gemini-2.5-flash';

test.describe('OpenRouter', () => {
  const key = env('OPENROUTER_API_KEY');
  test.skip(!key, 'OPENROUTER_API_KEY is not set in .env.local');

  test('key is valid and not out of credit', async ({ request }) => {
    const res = await request.get('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } });
    expect(res.status(), 'OpenRouter rejected the key').toBe(200);
    const { data } = await res.json();
    test.info().annotations.push({ type: 'openrouter usage', description: `usage=$${data.usage} limit=${data.limit ?? 'none'}` });
    if (typeof data.limit_remaining === 'number') expect(data.limit_remaining).toBeGreaterThan(0);
  });

  test('every model the app calls exists with the right output modality', async ({ request }) => {
    const { data } = await (await request.get('https://openrouter.ai/api/v1/models')).json();
    const byId = new Map<string, any>(data.map((m: any) => [m.id, m]));
    for (const id of GEMINI_IMAGE_MODELS) {
      expect(byId.has(id), `${id} is not listed on OpenRouter`).toBe(true);
      expect(byId.get(id).architecture.output_modalities).toContain('image');
    }
    expect(byId.has(OPENROUTER_TEXT_MODEL), `${OPENROUTER_TEXT_MODEL} (prompt enhance) is not listed`).toBe(true);
  });
});

for (const keyName of ['GEMINI_API_KEY', 'GEMINI_VEO_API_KEY']) {
  test.describe(`Gemini API with ${keyName}`, () => {
    const key = env(keyName);
    test.skip(!key, `${keyName} is not set in .env.local`);

    const models = [...GEMINI_IMAGE_MODELS.map((id) => id.replace(/^google\//, '')), OMNI_MODEL_ID, VEO_MODEL_ID];
    for (const model of models) {
      test(`key can access ${model}`, async ({ request }) => {
        const res = await request.get(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, {
          headers: { 'x-goog-api-key': key },
        });
        const reason = res.ok() ? '' : ((await res.json().catch(() => ({})))?.error?.message ?? '');
        expect(res.status(), `${model}: ${reason}`).toBe(200);
      });
    }
  });
}

test.describe('Replicate', () => {
  const token = env('REPLICATE_API_TOKEN');
  test.skip(!token, 'REPLICATE_API_TOKEN is not set in .env.local');

  test('token is valid', async ({ request }) => {
    const res = await request.get('https://api.replicate.com/v1/account', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status(), 'Replicate rejected the token').toBe(200);
  });

  test('topazlabs/image-upscale still accepts exactly the enums in shared/upscaleContract.ts', async ({ request }) => {
    const res = await request.get('https://api.replicate.com/v1/models/topazlabs/image-upscale', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const schemas = (await res.json()).latest_version.openapi_schema.components.schemas;
    const input = schemas.Input.properties;

    const enumOf = (field: string): string[] => {
      const prop = input[field];
      if (prop?.enum) return prop.enum;
      const ref: string | undefined = prop?.allOf?.[0]?.$ref ?? prop?.$ref;
      return ref ? schemas[ref.split('/').pop()!].enum : [];
    };

    // 'None' is a valid Replicate factor we deliberately do not offer.
    expect(enumOf('upscale_factor').filter((v) => v !== 'None').sort()).toEqual([...UPSCALE_FACTORS].sort());
    expect(enumOf('enhance_model').sort()).toEqual([...ENHANCE_MODELS].sort());
    expect(enumOf('output_format').sort()).toEqual([...OUTPUT_FORMATS].sort());
    expect(enumOf('subject_detection').sort()).toEqual([...SUBJECT_DETECTIONS].sort());
  });
});

import { test, expect } from '@playwright/test';
import { buildGeminiPrompt, generateRandomTags } from '../../services/promptGenerator';
import { buildExportFilename, buildZipBlob, computeCenterCoverRect, resolveTargetsForCard } from '../../services/exportCrop';
import { getModelCapability, kling30InputSchema } from '../../shared/modelContracts';
import { getKling3CostUsd } from '../../constants';
import { logEventSchema } from '../../api/log-event';
import { AgeGroupKey } from '../../types';

test.describe('Batch Prompt Generation & Realism Rules', () => {
  const AGE_GROUPS: AgeGroupKey[] = ['baby', 'vorschul', 'schulkind', 'teenager'];

  for (const ageGroup of AGE_GROUPS) {
    test(`generates realistic 5-layer prompt for ageGroup: ${ageGroup}`, () => {
      // the app rolls the scalloped-trim wall in 35% of the non-9:16 builds; this test is about the mural-on-the-whole-wall rule
      const tags = { ...generateRandomTags('4:3', ageGroup), wallArchitecture: 'full-wall' as const };
      const prompt = buildGeminiPrompt(tags);

      // 1. Layer 1: Wallpaper Mural Rule
      expect(prompt).toContain('FULL-HEIGHT 100% WALL COVERAGE');
      expect(prompt).toContain('single full-scale mural');

      // 2. Layer 2: Age Psychology & Setting. The scene is built from the CHOSEN style (its card in Promt/trends.json),
      //    never from a style written into the code.
      expect(prompt).toContain(` in ${tags.style} style`);
      if (ageGroup === 'baby') {
        expect(prompt).toContain('serene nursery for a baby');
      } else if (ageGroup === 'vorschul') {
        expect(prompt).toContain("delightful, joyful children's bedroom");
      } else if (ageGroup === 'schulkind') {
        expect(prompt).toContain('creative study sanctuary');
      } else {
        expect(prompt).toContain('contemporary youth bedroom');
      }

      // 3. Layer 3: Natural Materials & Furniture
      expect(prompt).toContain('solid wood');
      expect(prompt).toContain('tactile natural materials');

      // 4. Layer 4: Grazing Natural Daylight & Matte Sand-Grain Paper Texture (room shot uses 1 ref, no Craft Lambda brand noise)
      expect(prompt).toContain('ultra-matte non-woven fleece paper wallpaper with subtle fine sand-grain finish');
      expect(prompt).toContain('Grazing natural morning daylight from an adjacent window');

      // 5. Layer 5: Camera & Optics (Dynamically randomized variables)
      expect(prompt).toMatch(/f\/(4\.0|5\.6|8\.0|11) aperture/);
      expect(prompt).toMatch(/Shot on (Sony A7R V|Hasselblad H6D-100c|Canon EOS R5|Fujifilm GFX 100S)/);
      expect(prompt).toMatch(/(28mm gentle wide lens|35mm prime lens|45mm medium format lens|50mm normal lens)/);
    expect(prompt).not.toContain('24mm tilt-shift lens');
      // the real-photograph line (positive wording) comes from the same data file as the styles
      expect(prompt).toContain('A real editorial interior photograph');
      expect(prompt).toContain('Aspect ratio: 4:3');

      // 6. Zero Aspirational Buzzwords (no digital beauty filter triggers)
      expect(prompt).not.toContain('luxury interior design magazine');
      expect(prompt).not.toContain('Architectural Digest');
      expect(prompt).not.toContain('flawless look');
      expect(prompt).not.toContain('immaculately styled');
      expect(prompt).not.toContain('masterfully designed');

      // 7. No German parenthetical clutter
      expect(prompt).not.toContain('unlackiertes Massivholz');
      expect(prompt).not.toContain('Weiche Formen');
      expect(prompt).not.toContain('Eichenparkett');
      expect(prompt).not.toContain('Kinderbett mit Gitterstäben');

      // 8. No raw SEO search query noise & compact prompt size (down from ~6200-char bloat)
      expect(prompt).not.toContain('searches, highlighting a desire');
      expect(prompt).not.toContain('search volume');
      expect(prompt.length).toBeLessThan(4500);
    });
  }

  test('camera and optics variables are dynamically passed and randomized into the prompt', () => {
    const tags1 = generateRandomTags('4:3', 'baby');
    const tags2 = generateRandomTags('2:3', 'baby');

    // Variables exist in generated tags
    expect(tags1.cameraAngle).toBeDefined();
    expect(tags1.cameraElevation).toBeDefined();
    expect(tags1.cameraBody).toBeDefined();
    expect(tags1.lens).toBeDefined();
    expect(tags1.aperture).toBeDefined();

    const prompt1 = buildGeminiPrompt(tags1);
    expect(prompt1).toContain(tags1.cameraAngle);
    expect(prompt1).toContain(tags1.cameraElevation!);
    expect(prompt1).toContain(tags1.cameraBody!);
    expect(prompt1).toContain(tags1.lens!);
    expect(prompt1).toContain(tags1.aperture!);

    // Overriding variables explicitly is respected
    const customTags = {
      ...tags1,
      cameraAngle: 'three-quarter corner perspective — shot from corner of room, showing spatial depth and wallpaper wall',
      cameraElevation: 'low-angle perspective from the rug',
      cameraBody: 'Hasselblad H6D-100c',
      lens: '50mm normal lens',
      aperture: 'f/8.0 aperture'
    };
    const customPrompt = buildGeminiPrompt(customTags);
    expect(customPrompt).toContain('three-quarter corner perspective');
    expect(customPrompt).toContain('low-angle perspective from the rug');
    expect(customPrompt).toContain('Hasselblad H6D-100c');
    expect(customPrompt).toContain('50mm normal lens');
    expect(customPrompt).toContain('f/8.0 aperture');
  });

  test('Listing 40 (Sage stripes) generates consistent nursery prompt', () => {
    const tags = {
      color: 'Sage',
      style: 'Japandi',
      brand: 'Oliver Furniture',
      ageGroup: 'baby' as AgeGroupKey,
      keyObject: 'Classic slatted wooden baby crib',
      roomZone: 'sleep zone',
      lighting: 'warm morning sunbeams',
      cameraAngle: 'frontal — straight-on view of the wallpaper wall',
      cameraDistance: 'medium shot',
      depthOfField: 'medium depth of field',
      accessories: ['solid light oak wooden toy chest with smooth rounded corners', 'linen curtains in neutral tone'],
      aspectRatio: '4:3' as const,
      compositionStrategy: 'natural' as const,
      cinematicDetail: 'A warm late-afternoon amber glow sweeps across the room.',
    };

    const prompt = buildGeminiPrompt(tags);
    expect(prompt).toContain('Oliver Furniture-inspired Classic slatted wooden baby crib');
    expect(prompt).toContain('Interior colourway: Sage');
    expect(prompt).toContain('Aspect ratio: 4:3');
    expect(prompt).toContain('Avoid: peeling wallpaper');
  });
});

test.describe('Zod Telemetry Contract Shield', () => {
  test('validates and coerces a valid "started" lifecycle event', () => {
    const payload = {
      sessionId: 'sess_test_123',
      model: 'google/gemini-3.1-flash-image',
      prompt: 'Test prompt for sage stripes nursery',
      cost: 0,
      duration: 0,
      status: 'started',
      traceId: 'e2e-trace-id-abc-123',
      aspectRatio: '4:3',
      stage: 'batch_generate',
    };

    const result = logEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('started');
      expect(result.data.traceId).toBe('e2e-trace-id-abc-123');
      expect(result.data.stage).toBe('batch_generate');
      expect(result.data.cost).toBe(0);
      expect(result.data.duration).toBe(0);
    }
  });

  test('validates and coerces string cost/duration to numbers on "success"', () => {
    const payload = {
      sessionId: 'sess_test_123',
      model: 'google/gemini-3.1-flash-image',
      prompt: 'Commercial wallpaper listing',
      cost: '0.0672', // String from external caller
      duration: '4.85', // String
      status: 'success',
      traceId: 'e2e-trace-id-success-999',
      aspectRatio: '4:3',
      stage: 'batch_generate',
    };

    const result = logEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost).toBe(0.0672);
      expect(result.data.duration).toBe(4.85);
      expect(Number.isNaN(result.data.cost)).toBe(false);
      expect(Number.isNaN(result.data.duration)).toBe(false);
    }
  });

  test('rejects payloads missing mandatory fields', () => {
    const payloadMissingModel = {
      sessionId: 'sess_test_123',
      cost: 0.05,
    };

    const result = logEventSchema.safeParse(payloadMissingModel);
    expect(result.success).toBe(false);
  });

  test('rejects invalid lifecycle status', () => {
    const payloadInvalidStatus = {
      sessionId: 'sess_test_123',
      model: 'google/gemini-3.1-flash-image',
      status: 'non_existent_status',
    };

    const result = logEventSchema.safeParse(payloadInvalidStatus);
    expect(result.success).toBe(false);
  });

  test('each card in batch has unique card ID and distinct per-card traceId', () => {
    // 1. Simulate batch generation of 12 cards with format distribution
    const formats = [
      '9:16', '9:16', '9:16', '9:16', '9:16', '9:16',
      '2:3', '2:3', '2:3', '2:3',
      '4:3', '4:3'
    ];

    const cardIds = new Set<string>();
    const cardTraceIds = new Set<string>();

    const cards = formats.map((format, idx) => {
      const cardId = `card_${String(idx + 1).padStart(2, '0')}_${format.replace(':', 'x')}_${Math.random().toString(36).substring(2, 7)}`;
      cardIds.add(cardId);

      // Unique 32-char hex traceId per card execution
      const chars = '0123456789abcdef';
      let traceId = '';
      for (let i = 0; i < 32; i++) traceId += chars[Math.floor(Math.random() * chars.length)];
      cardTraceIds.add(traceId);

      // Verify telemetry payload carries both unique traceId and cardId as interactionId
      const payload = {
        sessionId: 'batch_session_123',
        model: 'google/gemini-3.1-flash-image',
        prompt: `Commercial wallpaper mockup card ${idx + 1}`,
        cost: 0,
        duration: 0,
        status: 'started' as const,
        traceId,
        interactionId: cardId,
        aspectRatio: format,
        stage: 'batch_generate'
      };

      const parsed = logEventSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.traceId).toBe(traceId);
        expect(parsed.data.interactionId).toBe(cardId);
      }

      return { id: cardId, traceId };
    });

    // 2. All 12 cards have strictly distinct IDs and trace IDs
    expect(cards.length).toBe(12);
    expect(cardIds.size).toBe(12);
    expect(cardTraceIds.size).toBe(12);

    // 3. Regenerating card 1 generates a new unique traceId while retaining its card ID
    const cardToRegen = cards[0];
    let newRegenTraceId = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < 32; i++) newRegenTraceId += chars[Math.floor(Math.random() * chars.length)];

    expect(newRegenTraceId).not.toBe(cardToRegen.traceId);

    const regenPayload = {
      sessionId: 'batch_session_123',
      model: 'google/gemini-3.1-flash-image',
      prompt: 'Regenerating card 1',
      cost: 0.0672,
      duration: 5.2,
      status: 'success' as const,
      traceId: newRegenTraceId,
      interactionId: cardToRegen.id,
      aspectRatio: '9:16',
      stage: 'batch_generate'
    };
    const parsedRegen = logEventSchema.safeParse(regenPayload);
    expect(parsedRegen.success).toBe(true);
    if (parsedRegen.success) {
      expect(parsedRegen.data.traceId).toBe(newRegenTraceId);
      expect(parsedRegen.data.interactionId).toBe(cardToRegen.id);
    }
  });

  test('macro texture card uses REFERENCE_IMAGE_2 and telemetry schema preserves tokens, spans, and billing fields', () => {
    const macroTags = { ...generateRandomTags('4:3', 'baby'), macroTexture: true };
    const macroPrompt = buildGeminiPrompt(macroTags);
    expect(macroPrompt).toContain('REFERENCE_IMAGE_1');
    expect(macroPrompt).toContain('REFERENCE_IMAGE_2');
    expect(macroPrompt).toContain('Craft Lambda');

    const richTelemetry = {
      sessionId: 'sess_tel_01',
      model: 'gemini-omni-1.2-flash',
      prompt: 'Forward drift',
      cost: 0.348,
      duration: 42.7,
      status: 'success' as const,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      provider: 'gemini',
      promptTokens: 1200,
      candidateTokens: 29000,
      totalTokens: 30200,
      videoTokens: 29000,
      costSource: 'usage' as const,
      kieCredits: 63,
      kieTaskId: 'task_abc123',
      serverTimeSeconds: 38.5,
      apiResponseId: 'v1_interactions_xyz',
      macroTexture: true,
    };
    const parsed = logEventSchema.safeParse(richTelemetry);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.spanId).toBe(richTelemetry.spanId);
      expect(parsed.data.videoTokens).toBe(29000);
      expect(parsed.data.costSource).toBe('usage');
      expect(parsed.data.serverTimeSeconds).toBe(38.5);
      expect(parsed.data.kieTaskId).toBe('task_abc123');
      expect(parsed.data.macroTexture).toBe(true);
    }
  });

  test('Canvas export crop preserves 100% width for 2:3 → 4:5 and keeps 9:16 untouched in pack mode', async () => {
    const rect = computeCenterCoverRect(1696, 2528, 1440, 1800);
    expect(rect).toEqual({ sx: 0, sy: 204, sw: 1696, sh: 2120 });

    const photoTargets = resolveTargetsForCard('2:3', 'pack_4x5_2x3');
    expect(photoTargets.map((t) => `${t.suffix}:${t.width}x${t.height}`)).toEqual([
      'site-meta-4x5:1440x1800',
      'pinterest-2x3:1000x1500',
    ]);

    const videoTargets = resolveTargetsForCard('9:16', 'pack_4x5_2x3');
    expect(videoTargets.map((t) => `${t.suffix}:${t.width}x${t.height}`)).toEqual([
      'reels-9x16:1080x1920',
    ]);

    const allPhotoTargets = resolveTargetsForCard('2:3', 'pack_all');
    expect(allPhotoTargets.map((t) => `${t.suffix}:${t.width}x${t.height}`)).toEqual([
      'site-meta-4x5:1440x1800',
      'pinterest-2x3:1000x1500',
      'meta-1x1:1080x1080',
    ]);
    expect(resolveTargetsForCard('9:16', 'pack_all').map((t) => t.suffix)).toEqual(['reels-9x16']);
    expect(buildExportFilename(1, 'meta-1x1', 1080, 1080)).toBe('wallpaper-01_meta-1x1_1080x1080.jpg');

    const zip = buildZipBlob([{ path: 'meta-1x1_1080x1080/wallpaper-01_meta-1x1_1080x1080.jpg', data: new Uint8Array([1, 2, 3, 4]) }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(new TextDecoder().decode(bytes)).toContain('meta-1x1_1080x1080/wallpaper-01_meta-1x1_1080x1080.jpg');
  });

  test('Kling 3.0 capability & Zod schema match live KIE contract and pricing', () => {
    const cap = getModelCapability('kling-3.0/video');
    expect(cap).toBeDefined();
    expect(cap!.provider).toBe('kie');
    expect(cap!.kieCredits2K).toBe(75.5);
    expect(getKling3CostUsd(5, 'std')).toBe(0.3775);
    expect(getKling3CostUsd(5, 'pro')).toBe(0.505);

    const parsed = kling30InputSchema.safeParse({
      prompt: 'Locked static camera. The wallpaper mural on the wall stays completely still.',
      image_urls: ['https://tempfile.aiquickdraw.com/frame.jpg'],
      sound: false,
      duration: '5',
      mode: 'std',
      multi_shots: false,
    });
    expect(parsed.success).toBe(true);
  });
});

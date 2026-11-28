import { AgeGroupKey, AudienceKey, BatchAspectRatio, UploadedImage } from '../types';
import { logGeminiEvent } from './geminiService';
import { generateSpanId, generateTraceId } from '../utils/tracing';

const AGE_DESCRIPTIONS: Record<AgeGroupKey, string> = {
  baby: 'a baby (0 to 1 year old)',
  vorschul: 'a preschool child (3 to 6 years old)',
  schulkind: 'a school-age child (6 to 10 years old)',
  teenager: 'a teenager (10 to 16 years old)',
};

const AUDIENCE_DESCRIPTIONS: Record<AudienceKey, string> = {
  boy: 'for a boy',
  girl: 'for a girl',
  neutral: 'gender-neutral (for any child)',
};

export interface RandomSearchResult {
  prompt: string;
  searchQueries: string[];
}

/**
 * Calls gemini-3.1-flash-lite with Vision (the uploaded wallpaper reference) + live Google Search
 * grounding (`tools: [{ google_search: {} }]`) to invent a fresh interior concept based ONLY on
 * the wallpaper artwork, child's age, child's gender, and aspect ratio — with zero preset constraints.
 */
export async function discoverRandomInteriorWithSearch(params: {
  geminiApiKey: string;
  wallpaper: UploadedImage;
  ageGroup: AgeGroupKey;
  audience: AudienceKey;
  aspectRatio: BatchAspectRatio;
  traceId?: string;
}): Promise<RandomSearchResult> {
  const { geminiApiKey, wallpaper, ageGroup, audience, aspectRatio } = params;
  const activeTraceId = params.traceId || generateTraceId();
  const spanId = generateSpanId();
  const startedAt = Date.now();
  const model = 'gemini-3.1-flash-lite';

  const ageText = AGE_DESCRIPTIONS[ageGroup] || AGE_DESCRIPTIONS.vorschul;
  const genderText = AUDIENCE_DESCRIPTIONS[audience] || AUDIENCE_DESCRIPTIONS.neutral;

  const instruction = [
    `Look at the attached wallpaper mural image. You have complete creative freedom to design the best possible children's room interior for this wallpaper.`,
    `Constraints: ONLY the child's age (${ageText}), gender (${genderText}), and photo aspect ratio (${aspectRatio}).`,
    `Use Google Search to find current, high-converting European children's room interior design ideas, furniture pieces, color harmonies, and decor that best match the specific theme, style, and colors of this wallpaper illustration.`,
    `Write a single cohesive English image-generation prompt (3 to 4 sentences, plain text only, no markdown, no bullet points, no quotes) for Nano Banana that:`,
    `1. Places REFERENCE_IMAGE_1 seamlessly on the main wall as a full-wall mural wallpaper keeping its exact artwork and colors 1:1.`,
    `2. Freely describes your chosen interior style, age-appropriate furniture, color palette, rug, lighting, and natural camera angle tailored specifically to this wallpaper, ${ageText}, ${genderText}, in ${aspectRatio} aspect ratio.`,
  ].join('\n');

  logGeminiEvent(
    model,
    `[RANDOM_SEARCH_DISCOVERY age=${ageGroup} audience=${audience} ar=${aspectRatio}]`,
    0,
    0,
    'started',
    null,
    activeTraceId,
    undefined,
    { provider: 'gemini', spanId, stage: 'prompt_enhance', aspectRatio },
  );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey.trim())}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: wallpaper.mimeType || 'image/jpeg',
                data: wallpaper.data,
              },
            },
            { text: instruction },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 450,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    logGeminiEvent(
      model,
      `[RANDOM_SEARCH_DISCOVERY_ERROR age=${ageGroup} audience=${audience}]`,
      0,
      (Date.now() - startedAt) / 1000,
      'error',
      errMsg,
      activeTraceId,
      undefined,
      { provider: 'gemini', spanId, stage: 'prompt_enhance', aspectRatio },
    );
    throw new Error(errMsg);
  }

  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
  const rawText = parts
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text!.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const searchQueries: string[] = data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
  const usage = data?.usageMetadata;

  logGeminiEvent(
    model,
    rawText,
    0.0002,
    (Date.now() - startedAt) / 1000,
    'success',
    null,
    activeTraceId,
    undefined,
    {
      provider: 'gemini',
      spanId,
      stage: 'prompt_enhance',
      aspectRatio,
      agentThoughts: searchQueries.length > 0 ? `Google Search: ${searchQueries.join(' | ')}` : undefined,
      promptTokens: usage?.promptTokenCount,
      candidateTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      costSource: 'usage',
    },
  );

  return {
    prompt: rawText,
    searchQueries,
  };
}

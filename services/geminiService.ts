import { GoogleGenAI, Part } from "@google/genai";
import { AIProvider, GenerationSettings, GenerationUsage, GeminiLogDetails, ModelType, UploadedImage } from "../types";
import { MODEL_PRICING } from "../constants";
import { getSessionId } from "./sessionTracker";

export interface GenerationResult {
  image: string;
  usage: GenerationUsage;
}

export interface WallCoordinates {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

type OpenRouterTextPart = { type: "text"; text: string };
type OpenRouterImagePart = { type: "image_url"; image_url: { url: string } };
type OpenRouterContentPart = OpenRouterTextPart | OpenRouterImagePart;

interface OpenRouterResponseImage {
  image_url?: { url?: string };
  imageUrl?: { url?: string };
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      images?: OpenRouterResponseImage[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: number | string;
    message?: string;
  };
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TITLE = "Nana Banana Composer";
const GEMINI_WALL_DETECT_MODEL = "gemini-3.1-flash-image";
const OPENROUTER_WALL_DETECT_MODEL = "google/gemini-3.1-flash-image";

const GEMINI_NEGATIVE_PROMPT = "peeling wallpaper, wallpaper peeling off wall, corner curl, page curl, paper curl, bed canopy, fabric canopy, baldachin, foreground lamps, foreground hanging lights, mounted animal heads, plush animal heads, stuffed animal heads, felt animal heads, wall-mounted animal heads, fake taxidermy, animal head wall decor, Tierkopf Wanddeko, animal trophies, half-wall wallpaper, half-height wallpaper, halbhoch tapeziert, two-tone wall, split wall, horizontally divided wall, wainscoting, wall paneling, beadboard, dado rail, chair rail, lower wall unpapered, partial wall coverage, wallpaper border, plain bottom half, split paint, plastic toys, distorted furniture, messy room, low quality, seams, tiling, repeating wallpaper patterns, cheap 3D render look, cartoon style, CGI, blurry textures";

const toDataUrl = (image: UploadedImage): string =>
  `data:${image.mimeType || "image/png"};base64,${image.data}`;

const normalizeImageInput = (imageInput: string): string => {
  if (
    imageInput.startsWith("data:image/") ||
    imageInput.startsWith("http://") ||
    imageInput.startsWith("https://")
  ) {
    return imageInput;
  }
  return `data:image/jpeg;base64,${imageInput.replace(/^data:image\/\w+;base64,/, "")}`;
};

const toGeminiModel = (model: ModelType): string => model.replace(/^google\//, "");

export const logGeminiEvent = async (
  model: string,
  prompt: string,
  cost: number,
  duration: number,
  status: "success" | "error" | "started",
  error: string | null = null,
  traceId?: string,
  negativePrompt?: string,
  details?: GeminiLogDetails
) => {
  try {
    const sessionId = getSessionId();
    await fetch("/api/log-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        model,
        prompt,
        cost,
        duration,
        status,
        error,
        traceId,
        negativePrompt,
        ...details,
      }),
    });
  } catch (err) {
    console.error("Failed to send log event to backend:", err);
  }
};

const getErrorMessage = (status: number, payload: any) => {
  const apiMessage =
    payload?.error?.message ||
    payload?.error?.metadata?.raw ||
    payload?.message;
  return apiMessage || `OpenRouter request failed with status ${status}`;
};

const buildOpenRouterHeaders = (apiKey: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": OPENROUTER_TITLE,
  };

  if (typeof window !== "undefined" && window.location?.origin) {
    headers["HTTP-Referer"] = window.location.origin;
  }

  return headers;
};

const postToOpenRouter = async (apiKey: string, payload: Record<string, unknown>): Promise<OpenRouterResponse> => {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, data));
  }

  return (data || {}) as OpenRouterResponse;
};

const extractOpenRouterImageUrl = (response: OpenRouterResponse): string | null => {
  const images = response.choices?.[0]?.message?.images;
  if (!images?.length) return null;

  const firstImage = images[0];
  return firstImage.image_url?.url || firstImage.imageUrl?.url || null;
};

const extractOpenRouterText = (response: OpenRouterResponse): string => {
  const content = response.choices?.[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map(part => part.text || "")
    .join("\n")
    .trim();
};

const isWallCoordinates = (value: any): value is WallCoordinates => {
  const hasPoint = (point: any) =>
    point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y);

  return (
    value &&
    hasPoint(value.topLeft) &&
    hasPoint(value.topRight) &&
    hasPoint(value.bottomRight) &&
    hasPoint(value.bottomLeft)
  );
};

const buildReferenceInstructions = (referenceImages: UploadedImage[], prompt: string): string => {
  if (referenceImages.length === 0) {
    return `USER PROMPT: ${prompt}\n\nINSTRUCTIONS: Generate the image solely based on USER PROMPT.`;
  }

  const isWallpaperPrompt = prompt.toLowerCase().includes("wallpaper") || prompt.toLowerCase().includes("mural");

  if (referenceImages.length === 1) {
    const instruction = isWallpaperPrompt
      ? "REFERENCE_IMAGE_1 is a single full-scale wallpaper mural (not a repeating tileable pattern). Flawlessly map and stretch this entire reference image onto the feature wall from edge to edge as a single, continuous, seamless mural without any repeating, tiling, cuts, or visible seams. The bottom of REFERENCE_IMAGE_1 must align perfectly with the floor/baseboard, and the top must reach the ceiling. Apply USER PROMPT to style the room around it."
      : "Use REFERENCE_IMAGE_1 as the style and composition base. Apply USER PROMPT on top of it.";
    return `USER PROMPT: ${prompt}\n\nINSTRUCTIONS: ${instruction}`;
  }

  const instruction = `Use REFERENCE_IMAGE_1 as the style/composition base. Extract subjects from REFERENCE_IMAGE_2-${referenceImages.length} and place them naturally into the generated scene.`;
  return `USER PROMPT: ${prompt}\n\nINSTRUCTIONS: ${instruction}`;
};

const generateImageCompositionWithOpenRouter = async (
  apiKey: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings
): Promise<GenerationResult> => {
  const { model, prompt, aspectRatio, imageSize } = settings;

  const content: OpenRouterContentPart[] = [
    { type: "text", text: buildReferenceInstructions(referenceImages, prompt) },
  ];

  referenceImages.forEach((img, i) => {
    const isWallpaperPrompt = settings.prompt.toLowerCase().includes("wallpaper") || settings.prompt.toLowerCase().includes("mural");
    const roleText = i === 0
      ? (isWallpaperPrompt
          ? "REFERENCE_IMAGE_1 (wallpaper mural): this is the wallpaper product. Flawlessly stretch it across the entire feature wall from edge to edge without tiling or repeating."
          : "REFERENCE_IMAGE_1 (style/composition base): match the atmosphere and scene structure of this image.")
      : `REFERENCE_IMAGE_${i + 1} (object to include): extract the main subject from this image and place it naturally into the scene.`;
    content.push({ type: "text", text: roleText });
    content.push({ type: "image_url", image_url: { url: toDataUrl(img) } });
  });

  console.log(`[OpenRouter] model=${model} aspectRatio=${aspectRatio} imageSize=${imageSize}`);

  const response = await postToOpenRouter(apiKey, {
    model,
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
    image_config: {
      aspect_ratio: aspectRatio,
      ...(model === ModelType.Pro || model === ModelType.Flash31 ? { image_size: imageSize } : {}),
    },
  });

  const image = extractOpenRouterImageUrl(response);
  if (!image) {
    throw new Error("No image generated in the OpenRouter response.");
  }

  const usage: GenerationUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    candidateTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };

  return { image, usage };
};

const generateImageCompositionWithGemini = async (
  apiKey: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings
): Promise<GenerationResult> => {
  const { model, prompt, aspectRatio, imageSize } = settings;
  const ai = new GoogleGenAI({ apiKey });
  const parts: Part[] = [];

  referenceImages.forEach((img, i) => {
    const isWallpaperPrompt = settings.prompt.toLowerCase().includes("wallpaper") || settings.prompt.toLowerCase().includes("mural");
    const role = i === 0
      ? (isWallpaperPrompt
          ? "REFERENCE_IMAGE_1 (wallpaper mural): this is the wallpaper product. Flawlessly stretch it across the entire feature wall from edge to edge without tiling or repeating."
          : "REFERENCE_IMAGE_1 (style/composition base): match the atmosphere and scene structure of this image.")
      : `REFERENCE_IMAGE_${i + 1} (object to include): extract the main subject from this image and place it naturally into the scene.`;
    parts.push({ text: role });
    parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  });

  parts.push({ text: buildReferenceInstructions(referenceImages, prompt) });

  console.log(`[Gemini Direct] model=${toGeminiModel(model)} aspectRatio=${aspectRatio} imageSize=${imageSize}`);

  const response = await ai.models.generateContent({
    model: toGeminiModel(model),
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio,
        ...(model === ModelType.Pro || model === ModelType.Flash31 ? { imageSize } : {}),
        negativePrompt: GEMINI_NEGATIVE_PROMPT,
      } as any,
    },
  });

  if (response.candidates?.length) {
    const candidateParts = response.candidates[0].content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        const usage: GenerationUsage = {
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          candidateTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        };
        return {
          image: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
          usage,
        };
      }
    }
  }

  throw new Error("No image generated in the Gemini response.");
};

const buildRefinementPrompt = (prompt: string): string => {
  // Parse overlay if exists in prompt
  const overlayMatch = prompt.match(/text '([^']+)'/);
  const positionMatch = prompt.match(/in the (bottom left|bottom right|top left|top right) corner/i);
  const overlayText = overlayMatch ? overlayMatch[1] : null;
  const overlayPosition = positionMatch ? positionMatch[1] : null;

  let textInstruction = "";
  if (overlayText && overlayPosition) {
    const colorMatch = prompt.match(/soft (olivbraun|olivgrün|rosa|blau|gelb|grau|pastel pink|charcoal-grey|pastel)/i);
    const colorName = colorMatch ? `soft ${colorMatch[1]}` : "soft pastel color";
    textInstruction = ` On the bottom corner or where specified in REFERENCE_IMAGE_1, render the text '${overlayText}' written in an elegant, clear handwritten cursive script on top of a subtle ${colorName} watercolor brushstroke. The text spelling must be exactly '${overlayText}'.`;
  }

  return `A premium, high-resolution editorial photograph of the children's bedroom. You MUST preserve the exact same room layout, furniture items, window position, toys, floor parquet, and camera perspective shown in REFERENCE_IMAGE_1. Do not generate a different room or change the layout. Seamlessly apply the wallpaper pattern from REFERENCE_IMAGE_2 onto the wall matching the perspective.${textInstruction} Render the scene with premium photorealistic textures (rich solid wood grain, soft woven linen) and soft diffused lighting, avoiding any CGI look.`;
};

const generateBatchWithOpenRouter = async (
  apiKey: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType,
  draftImage?: string
): Promise<string> => {
  const content: OpenRouterContentPart[] = [];

  if (draftImage) {
    content.push({ type: "text", text: "REFERENCE_IMAGE_1 (structure and composition base): match the room layout, camera angle, furniture placement, and perspective of this image exactly." });
    content.push({ type: "image_url", image_url: { url: normalizeImageInput(draftImage) } });
    content.push({ type: "text", text: "REFERENCE_IMAGE_2 (wallpaper product): place this wallpaper pattern seamlessly onto the wall from REFERENCE_IMAGE_1." });
    content.push({ type: "image_url", image_url: { url: toDataUrl(wallpaper) } });
    content.push({
      type: "text",
      text: buildRefinementPrompt(prompt)
    });
  } else {
    content.push({ type: "text", text: "WALLPAPER_PATTERN: The following image is the wallpaper product to place on the wall. Apply it exactly as instructed." });
    content.push({ type: "text", text: prompt });
    content.push({ type: "image_url", image_url: { url: toDataUrl(wallpaper) } });
  }

  console.log(`[OpenRouter Batch] model=${model} aspectRatio=${aspectRatio}`);

  const response = await postToOpenRouter(apiKey, {
    model,
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
    image_config: {
      aspect_ratio: aspectRatio,
      image_size: "2K",
    },
  });

  const image = extractOpenRouterImageUrl(response);
  if (!image) {
    throw new Error("No image generated in the OpenRouter response.");
  }
  return image;
};

const generateBatchWithGemini = async (
  apiKey: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType,
  draftImage?: string,
  textureImage?: UploadedImage | null
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const parts: Part[] = [];

  if (draftImage) {
    const cleanBase64 = draftImage.replace(/^data:image\/\w+;base64,/, "");
    const match = draftImage.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : "image/png";
    parts.push({ text: "REFERENCE_IMAGE_1 (structure and composition base): match the room layout, camera angle, furniture placement, and perspective of this image exactly." });
    parts.push({ inlineData: { data: cleanBase64, mimeType } });
    parts.push({ text: "REFERENCE_IMAGE_2 (wallpaper product): place this wallpaper pattern seamlessly onto the wall from REFERENCE_IMAGE_1." });
    parts.push({ inlineData: { data: wallpaper.data, mimeType: wallpaper.mimeType } });
    if (textureImage) {
      parts.push({ text: "REFERENCE_IMAGE_3 (physical material texture): apply this tactile non-woven sand grain texture and ultra-matte surface finish to the wallpaper on the wall. Do not copy any graphic drawings from this reference." });
      parts.push({ inlineData: { data: textureImage.data, mimeType: textureImage.mimeType } });
    }
    parts.push({
      text: buildRefinementPrompt(prompt)
    });
  } else if (textureImage) {
    parts.push({ text: "REFERENCE_IMAGE_1 (Wallpaper Graphic Artwork): This is the exact wallpaper graphic design to display on the accent wall. Preserve all colors, illustrations, lines, and composition 1:1 without alteration." });
    parts.push({ inlineData: { data: wallpaper.data, mimeType: wallpaper.mimeType } });
    parts.push({ text: "REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a macro photograph of the real physical wallpaper material. Extract and copy ONLY the physical surface micro-relief: the fine-grain sand texture (Sandstruktur), non-woven paper fleece substrate, and ultra-matte chalky finish under natural daylight. DO NOT copy or transfer any graphic drawings or gold leaf designs from REFERENCE_IMAGE_2. Only transfer its physical paper texture and tactile surface grain onto the wall." });
    parts.push({ inlineData: { data: textureImage.data, mimeType: textureImage.mimeType } });
    parts.push({ text: prompt });
  } else {
    parts.push({ text: "WALLPAPER_PATTERN: The following image is the wallpaper product to place on the wall. Apply it exactly as instructed." });
    parts.push({ inlineData: { data: wallpaper.data, mimeType: wallpaper.mimeType } });
    parts.push({ text: prompt });
  }

  console.log(`[Gemini Direct Batch] model=${toGeminiModel(model)} aspectRatio=${aspectRatio}${textureImage ? ' + textureRef (Craft Lambda)' : ''}`);

  const response = await ai.models.generateContent({
    model: toGeminiModel(model),
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: "2K",
        negativePrompt: GEMINI_NEGATIVE_PROMPT,
      } as any,
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("No image generated in the Gemini response.");
};

interface WallDetection {
  coords: WallCoordinates;
  promptTokens: number;
}

const detectWallWithOpenRouter = async (apiKey: string, imageInput: string): Promise<WallDetection> => {
  const prompt = `
Analyze this interior image. Identify the 4 corners of the MAIN wall where wallpaper is or should be applied.
The wall might be partially obscured by furniture (bed, sofa), but I need the projected corners of the wall plane.

Return ONLY a raw JSON object with normalized coordinates (0 to 1).
Format:
{
  "topLeft": {"x": 0.1, "y": 0.1},
  "topRight": {"x": 0.9, "y": 0.1},
  "bottomRight": {"x": 0.9, "y": 0.9},
  "bottomLeft": {"x": 0.1, "y": 0.9}
}
`.trim();

  const response = await postToOpenRouter(apiKey, {
    model: OPENROUTER_WALL_DETECT_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: normalizeImageInput(imageInput) } },
        ],
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const text = extractOpenRouterText(response);
  if (!text) throw new Error("No text response from OpenRouter vision model.");
  const coords = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
  if (!isWallCoordinates(coords)) throw new Error("Vision response did not match expected coordinate format.");
  return { coords, promptTokens: response.usage?.prompt_tokens ?? 0 };
};

const detectWallWithGemini = async (apiKey: string, imageInput: string): Promise<WallDetection> => {
  const ai = new GoogleGenAI({ apiKey });
  const normalized = normalizeImageInput(imageInput).replace(/^data:image\/\w+;base64,/, "");

  const prompt = `
Analyze this interior image. Identify the 4 corners of the MAIN wall where wallpaper is or should be applied.
The wall might be partially obscured by furniture (bed, sofa), but I need the projected corners of the wall plane.

Return ONLY a raw JSON object with normalized coordinates (0 to 1).
Format:
{
  "topLeft": {"x": 0.1, "y": 0.1},
  "topRight": {"x": 0.9, "y": 0.1},
  "bottomRight": {"x": 0.9, "y": 0.9},
  "bottomLeft": {"x": 0.1, "y": 0.9}
}
`.trim();

  const response = await ai.models.generateContent({
    model: GEMINI_WALL_DETECT_MODEL,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: normalized,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text response from Gemini vision model.");
  const coords = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
  if (!isWallCoordinates(coords)) throw new Error("Vision response did not match expected coordinate format.");
  return { coords, promptTokens: response.usageMetadata?.promptTokenCount ?? 0 };
};

export const generateImageComposition = async (
  apiKey: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings,
  provider: AIProvider = "openrouter",
  traceId?: string
): Promise<GenerationResult> => {
  if (!apiKey) {
    const label = provider === "openrouter" ? "OpenRouter" : "Gemini";
    throw new Error(`${label} API Key is required.`);
  }

  const startTime = Date.now();
  const pricing = MODEL_PRICING[settings.model] || { inputPer1M: 0, outputPerImage: 0 };

  try {
    let result: GenerationResult;
    if (provider === "gemini") {
      result = await generateImageCompositionWithGemini(apiKey, referenceImages, settings);
    } else {
      result = await generateImageCompositionWithOpenRouter(apiKey, referenceImages, settings);
    }

    const duration = (Date.now() - startTime) / 1000;
    const cost = (result.usage.promptTokens / 1_000_000) * pricing.inputPer1M + pricing.outputPerImage;

    logGeminiEvent(settings.model, settings.prompt, cost, duration, "success", null, traceId, undefined);
    return result;
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(settings.model, settings.prompt, 0.0, duration, "error", err.message || "Unknown error", traceId, undefined);
    throw err;
  }
};

export const generateBatchImage = async (
  apiKey: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType = ModelType.Flash31,
  provider: AIProvider = "openrouter",
  draftImage?: string,
  traceId?: string,
  textureImage?: UploadedImage | null
): Promise<string> => {
  if (!apiKey) {
    const label = provider === "openrouter" ? "OpenRouter" : "Gemini";
    throw new Error(`${label} API Key is required.`);
  }

  const startTime = Date.now();

  try {
    let result: string;
    if (provider === "gemini") {
      result = await generateBatchWithGemini(apiKey, wallpaper, prompt, aspectRatio, model, draftImage, textureImage);
    } else {
      result = await generateBatchWithOpenRouter(apiKey, wallpaper, prompt, aspectRatio, model, draftImage);
    }

    const duration = (Date.now() - startTime) / 1000;
    const estimatedCost = model === ModelType.Pro ? 0.134 : 0.0672;

    logGeminiEvent(model, prompt, estimatedCost, duration, "success", null, traceId);
    return result;
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(model, prompt, 0.0, duration, "error", err.message || "Unknown error", traceId);
    throw err;
  }
};

export const detectWallCoordinates = async (
  apiKey: string,
  imageBase64: string,
  provider: AIProvider = "openrouter"
): Promise<WallCoordinates> => {
  if (!apiKey) {
    const label = provider === "openrouter" ? "OpenRouter" : "Gemini";
    throw new Error(`${label} API Key is required.`);
  }

  const model = provider === "gemini" ? GEMINI_WALL_DETECT_MODEL : OPENROUTER_WALL_DETECT_MODEL;
  const startTime = Date.now();

  try {
    const { coords, promptTokens } = provider === "gemini"
      ? await detectWallWithGemini(apiKey, imageBase64)
      : await detectWallWithOpenRouter(apiKey, imageBase64);
    const corners = [coords.topLeft, coords.topRight, coords.bottomRight, coords.bottomLeft]
      .map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
      .join(" ");
    // The answer is a few dozen JSON tokens, so only the image input is priced.
    const cost = (promptTokens / 1_000_000) * MODEL_PRICING[ModelType.Flash31].inputPer1M;
    logGeminiEvent(model, `Wall detection → ${corners}`, cost, (Date.now() - startTime) / 1000, "success");
    return coords;
  } catch (error: any) {
    console.error(`Vision API Error (${provider}):`, error);
    logGeminiEvent(model, "Wall detection failed — full frame used instead", 0, (Date.now() - startTime) / 1000, "error", error?.message || "Unknown error");
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    };
  }
};

export const enhancePromptText = async (
  apiKey: string,
  userPrompt: string,
  provider: AIProvider = "openrouter"
): Promise<string> => {
  if (!apiKey) {
    throw new Error("API Key is required to enhance prompt.");
  }

  const startTime = Date.now();
  const modelName = provider === "gemini" ? "gemini-3.1-flash-image" : "google/gemini-3.1-flash-image";
  const systemInstruction = `You are an expert prompt engineer for Gemini Image Generation. Translate (if needed) and expand the user's short prompt into a high-end, detailed architectural interior photography prompt for children's room wallpaper mockups.

Apply these strict rules:
- Target Style: Luxury editorial photography, Architectural Digest style, warm and sophisticated.
- Textures: Emphasize matte paper fiber wallpaper texture, natural solid wood grain (oak, birch), soft linen fabrics, rattan.
- Lighting: Diffused natural daylight, soft sunbeams, realistic ambient shadows.
- Screens / Computers: If the scene includes a computer, monitor, TV, or screen, explicitly describe it as turned off, appearing as a clean, blank matte dark screen with no glossy reflections.
- No plastic, no cheap 3D render look, no visual noise.
- Output ONLY the final expanded prompt in English. Maximum 120 words. No introduction, no markdown blocks, no quotation marks. Just the raw expanded prompt text.`;

  try {
    let resultText = userPrompt;
    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: [
          { text: systemInstruction },
          { text: `USER PROMPT: ${userPrompt}` }
        ]
      });
      resultText = response.text?.trim() || userPrompt;
    } else {
      const response = await postToOpenRouter(apiKey, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `USER PROMPT: ${userPrompt}` }
        ]
      });
      resultText = extractOpenRouterText(response) || userPrompt;
    }

    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelName, `Enhanced: "${userPrompt}" -> "${resultText}"`, 0.0001, duration, "success");
    return resultText;
  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelName, `Enhance Failed: "${userPrompt}"`, 0.0, duration, "error", error.message || "Unknown error");
    console.error("Failed to enhance prompt:", error);
    return userPrompt;
  }
};

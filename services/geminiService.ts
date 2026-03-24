import { GoogleGenAI, Part } from "@google/genai";
import { GenerationSettings, GenerationUsage, ModelType, UploadedImage } from "../types";

export interface GenerationResult {
  image: string;
  usage: GenerationUsage;
}

export const generateImageComposition = async (
  apiKey: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings
): Promise<GenerationResult> => {
  const { model, prompt, aspectRatio, imageSize } = settings;

  if (!apiKey) {
    throw new Error("API Key is required. Please enter your Gemini API Key.");
  }

  // Initialize client with user provided key
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const parts: Part[] = [];

  // Reference images: first = style base, rest = objects to include
  referenceImages.forEach((img, i) => {
    const role = i === 0
      ? "REFERENCE_IMAGE_1 (style/composition base): match the atmosphere and scene structure of this image."
      : `REFERENCE_IMAGE_${i + 1} (object to include): extract the main subject from this image and place it naturally into the scene.`;
    parts.push({ text: role });
    parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  });

  const instructions = referenceImages.length === 0
    ? "Generate the image solely based on USER PROMPT."
    : referenceImages.length === 1
      ? "Use REFERENCE_IMAGE_1 as the style and composition base. Apply USER PROMPT on top of it."
      : `Use REFERENCE_IMAGE_1 as the style/composition base. Extract subjects from REFERENCE_IMAGE_2–${referenceImages.length} and place them naturally into the generated scene.`;

  parts.push({ text: `USER PROMPT: ${prompt}\n\nINSTRUCTIONS: ${instructions}` });

  try {
    console.log(`[Gemini] Generating with model: ${model}, aspectRatio: ${aspectRatio}, imageSize: ${imageSize}`);
    // Call API
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          ...(model === ModelType.Pro || model === ModelType.Flash31 ? { imageSize: imageSize } : {}),
        },
      },
    });

    // Extract Image
    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content && content.parts) {
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.data) {
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
    }

    throw new Error("No image generated in the response.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateBatchImage = async (
  apiKey: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType = ModelType.Flash31,
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required.");

  const ai = new GoogleGenAI({ apiKey });

  const parts: Part[] = [
    { text: "WALLPAPER_PATTERN: The following image is the wallpaper product to place on the wall. Apply it exactly as instructed." },
    { inlineData: { data: wallpaper.data, mimeType: wallpaper.mimeType } },
    { text: prompt },
  ];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: '2K',
        },
      },
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image generated in the response.");
  } catch (error) {
    console.error("Gemini Batch API Error:", error);
    throw error;
  }
};

export interface WallCoordinates {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export const detectWallCoordinates = async (
  apiKey: string,
  imageBase64: string
): Promise<WallCoordinates> => {
  if (!apiKey) {
    throw new Error("API Key is required.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const model = "gemini-2.0-flash"; // Use Flash for fast vision analysis

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
  `;

  // Clean base64 header if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text response from Vision API");

    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const coords = JSON.parse(jsonStr);

    return coords;
  } catch (error) {
    console.error("Vision API Error:", error);
    // Fallback: return full image coordinates if detection fails
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    };
  }
};

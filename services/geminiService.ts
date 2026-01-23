import { GoogleGenAI, Part } from "@google/genai";
import { GenerationSettings, ModelType, UploadedImage } from "../types";

export const generateImageComposition = async (
  apiKey: string,
  referenceImage: UploadedImage | null,
  settings: GenerationSettings
): Promise<string> => {
  const { model, prompt, aspectRatio, imageSize } = settings;

  if (!apiKey) {
    throw new Error("API Key is required. Please enter your Gemini API Key.");
  }

  // Initialize client with user provided key
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // Construct Parts
  const parts: Part[] = [];

  // 1. Add Reference Image (Optional)
  if (referenceImage) {
    parts.push({ text: "REFERENCE_IMAGE: This is the EXACT image that must be used as the base/reference." });
    parts.push({
      inlineData: {
        data: referenceImage.data,
        mimeType: referenceImage.mimeType,
      },
    });
  }

  // 2. Add Text Prompt
  const fullPrompt = `
    TASK: Image Generation based on user instructions and an EXACT reference image.

    USER PROMPT: ${prompt}

    INSTRUCTIONS:
    1. If a REFERENCE_IMAGE is provided, you MUST use it 1:1 as the base for the generation. Maintain the exact composition, key elements, and perspective of the REFERENCE_IMAGE.
    2. Apply the styles, lighting, or modifications requested in the USER PROMPT while strictly preserving the identity and structure of the REFERENCE_IMAGE.
    3. If no REFERENCE_IMAGE is provided, generate the image solely based on the USER PROMPT.
    4. Ensure maximum visual fidelity and adherence to the specified aspect ratio.
    
    ${referenceImage ? "CRITICAL: The REFERENCE_IMAGE must be preserved 1:1 in its core structure. Integrate the prompt into this specific image." : ""}
  `;
  parts.push({ text: fullPrompt });

  try {
    // Call API
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          ...(model === ModelType.Pro ? { imageSize: imageSize } : {}),
        },
      },
    });

    // Extract Image
    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content && content.parts) {
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
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

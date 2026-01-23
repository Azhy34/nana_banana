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
    parts.push({ text: "REFERENCE_IMAGE: Use this image as a style and composition reference." });
    parts.push({
      inlineData: {
        data: referenceImage.data,
        mimeType: referenceImage.mimeType,
      },
    });
  }

  // 2. Add Text Prompt
  const fullPrompt = `
    TASK: Image Generation based on user instructions and optional reference.

    USER PROMPT: ${prompt}

    INSTRUCTIONS:
    1. If a REFERENCE_IMAGE is provided, use it to guide the style, lighting, and composition of the generated image, blending it with the requirements from the USER PROMPT.
    2. If no REFERENCE_IMAGE is provided, generate the image solely based on the USER PROMPT.
    3. Ensure high quality, adherence to the specified aspect ratio, and visual fidelity.
    
    ${referenceImage ? "Make sure the result respects the visual style of the REFERENCE_IMAGE." : ""}
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

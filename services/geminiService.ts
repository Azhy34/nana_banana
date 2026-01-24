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

import { GoogleGenAI, Part } from "@google/genai";
import { GenerationSettings, ModelType, UploadedImage } from "../types";

export const generateImageComposition = async (
  referenceImage: UploadedImage | null,
  peopleImages: UploadedImage[],
  settings: GenerationSettings
): Promise<string> => {
  const { model, prompt, aspectRatio, imageSize } = settings;

  // API Key handling for Pro model
  const win = window as any;
  if (model === ModelType.Pro && win.aistudio) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      try {
        await win.aistudio.openSelectKey();
      } catch (e) {
        throw new Error("API Key selection failed or was cancelled.");
      }
    }
  }

  // Initialize client (fresh instance to pick up key changes)
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Construct Parts
  const parts: Part[] = [];

  // 1. Add Reference Image (The Base)
  if (referenceImage) {
    parts.push({ text: "BASE_REFERENCE_IMAGE: This is the MASTER STYLE, MEDIUM, and COMPOSITION source. The final image must look exactly like this image in terms of lighting, art style (e.g. 3D render, photo, painting), camera angle, and atmosphere." });
    parts.push({
      inlineData: {
        data: referenceImage.data,
        mimeType: referenceImage.mimeType,
      },
    });
  }

  // 2. Add People Images (The Identity)
  if (peopleImages.length > 0) {
    parts.push({ text: "IDENTITY_SOURCE_IMAGES: Use these images ONLY to understand facial features and hair structure. Do NOT copy the lighting, style, or background from these images." });
    peopleImages.forEach((img) => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    });
  }

  // 3. Add Text Prompt (Enhanced with Negative Constraints and Blending Rules)
  const fullPrompt = `
    TASK: Adaptive Style Identity Replacement.

    PRIMARY OBJECTIVE: You are an expert digital artist capable of mimicking ANY art style. Your goal is to keep the BASE_REFERENCE_IMAGE exactly as it is, but morph the character's facial features to match the IDENTITY_SOURCE_IMAGES.

    NEGATIVE CONSTRAINTS (THINGS YOU MUST NEVER DO):
    - NO split screens, NO before/after comparisons, NO collages.
    - NO extra people. If reference has 1 person, output 1 person.
    - NO "Uncanny Valley" stylistic mismatch (e.g., do NOT put a photorealistic face on a 3D cartoon body).
    - NO "floating head" look. The neck and jawline must connect naturally.
    - NO photoshop seams or sharp edges around the face.
    - NO text, NO watermarks, NO borders.

    CRITICAL STYLE & BLENDING RULES:
    1. MEDIA & STYLE MATCHING (MOST IMPORTANT): First, identify the specific medium of the BASE_REFERENCE_IMAGE (e.g., "3D Pixar-style render", "Claymation", "Oil Painting", "Studio Photography", "Caricature"). The new face MUST be generated using that EXACT same rendering technique.
    2. PROPORTIONS & ANATOMY: If the reference is a CARICATURE (e.g., large head, small body, exaggerated features), you MUST generate the new face with those SAME exaggerated proportions. Do not "fix" the anatomy to look realistic.
    3. LIGHTING MATCHING: Analyze the light direction, color, and intensity in BASE_REFERENCE_IMAGE. Apply EXACTLY that same lighting to the new face.
    4. TEXTURE MATCHING: If the reference is a 3D render, the skin must look like smooth 3D rendered skin. If it is a photo, it must have skin pores.
    5. EXPRESSION & DETAIL TRANSFER: If the BASE_REFERENCE_IMAGE features specific facial details (e.g., VISIBLE TEETH, wide smile, squinting eyes), the new face MUST adopt that exact expression to match the vibe.
    6. ASPECT RATIO HANDLING: If the requested aspect ratio is wider than the reference, EXTEND the background naturally. Do NOT fill the space by duplicating the person.

    EXECUTION STEPS:
    1. Analyze the BASE_REFERENCE_IMAGE style (Photo vs 3D vs Art) and Proportions.
    2. Extract facial structure from IDENTITY_SOURCE_IMAGES.
    3. Synthesize the new face into the scene, rendering it in the EXACT style of the reference.
    4. Apply user adjustment: ${prompt || "None (Keep original composition)"}
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

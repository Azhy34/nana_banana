# Qwen Image 2 Integration Plan

## Goal

Add `qwen/qwen-image-2` to the project using the existing Replicate setup, while keeping the current Gemini/OpenRouter flow intact.

Recommended integration path: Variant 1.

- Keep current generation flow for Gemini/OpenRouter.
- Add a separate Replicate generation path for Qwen.
- Expose Qwen in the same UX model selector next to Gemini models.
- Reuse existing `REPLICATE_API_TOKEN`.

## What Was Verified Before Integration

- `REPLICATE_API_TOKEN` is already wired in the project via env and header UI.
- Replicate is already used for upscaling through `services/replicateService.ts`.
- Main image generation currently goes through `services/geminiService.ts`.
- Model selection is currently driven by:
  - `types.ts`
  - `constants.ts`
  - `components/PromptStep.tsx`
  - `components/BatchGenerator.tsx`
- Cost display is calculated in `App.tsx` using `MODEL_PRICING`.
- Batch generation also depends on the same `ModelType` enum and generation service.

## Replicate / Qwen Facts Confirmed

Model:
- `qwen/qwen-image-2`

Supported inputs:
- `prompt`
- `image`
- `aspect_ratio`
- `match_input_image`
- `negative_prompt`
- `seed`

Pricing:
- `$0.035` per output image

API pattern:
- Start prediction with Replicate API
- Poll prediction until `succeeded`
- Read output URL from prediction result

Live checks completed:
- `text-to-image` with `aspect_ratio: "16:9"` succeeded
- `image` input via data URL with `match_input_image: true` succeeded on a real PNG file

Important implementation consequence:
- Qwen can be integrated without `upload.ts` in the first pass
- For larger images, Replicate docs still recommend HTTP URLs over data URLs when file size is above ~256 KB
- First pass should therefore include a guard or client-side compression for Qwen reference images

## Integration Scope

### 1. Types

Update `types.ts`.

To do:
- Add `QwenImage2` to `ModelType`
- Treat Qwen as a model entry, not a new provider
- Keep backward compatibility with existing Gemini model values

### 2. Pricing

Update `constants.ts`.

To do:
- Add pricing entry for `QwenImage2`
- Keep current Gemini pricing unchanged
- Make sure estimated cost in `App.tsx` still works for mixed model families

Target price:
- `outputPerImage: 0.035`

Note:
- Qwen on Replicate does not use token-based input pricing the same way Gemini pricing is currently modeled
- For UI consistency, use `inputPer1M: 0` and `outputPerImage: 0.035`

### 3. UX Model Selector

Update `components/PromptStep.tsx`.

To do:
- Add `Qwen Image 2` to model selector
- Add human-readable description for Qwen
- Make sure the model dropdown still feels simple and not overloaded

Recommended label:
- `Qwen Image 2 (Replicate)`

### 4. Batch Model Buttons

Update `components/BatchGenerator.tsx`.

To do:
- Add `Qwen Image 2` button next to Gemini buttons
- Keep button copy clear:
  - `3.1 Flash`
  - `Pro`
  - `Qwen 2`
- Ensure regeneration uses the selected model consistently

### 5. Replicate Generation Service

Extend `services/replicateService.ts`.

To do:
- Add a new prediction flow for `qwen/qwen-image-2`
- Add helper to start Qwen generation
- Add helper to poll prediction
- Normalize output URL
- Support both:
  - text-to-image
  - image-to-image with optional reference image

Recommended function shape:
- `generateQwenImage(...)`
- `generateQwenBatchImage(...)`

### 6. Generation Router

Create `services/generationRouter.ts`.

To do:
- Detect when selected model is a Qwen model
- Route Qwen requests to Replicate instead of Gemini/OpenRouter
- Keep current Gemini/OpenRouter logic untouched

Recommended rule:
- If model is `QwenImage2`, use Replicate token
- Else use current provider flow

Decision:
- Do not expand `geminiService.ts` into a mixed vendor file
- Keep `geminiService.ts` focused on Gemini/OpenRouter
- Introduce a thin router layer that dispatches by `ModelType`

### 7. App-Level Key Handling

Update `App.tsx`.

To do:
- Keep `provider` logic as-is for Gemini/OpenRouter
- Add token validation for Qwen path
- If Qwen is selected and token is missing, show Replicate-specific error
- Make estimated cost continue to show correctly

Important:
- Qwen should not require switching provider in header
- It should work as a model-level routing exception using `replicateToken`

### 8. Error Messages

To do:
- Add clear error when `REPLICATE_API_TOKEN` is missing
- Distinguish between:
  - provider API key missing
  - Replicate token missing
  - Replicate prediction failure

### 9. Resolution / Aspect Ratio Rules

To do:
- Keep only Qwen-supported aspect ratios when Qwen is selected
- Map unsupported project ratios by hiding them in the Qwen UI
- Disable Gemini-style image-size behavior for Qwen

Confirmed Qwen-supported aspect ratios:
- `1:1`
- `16:9`
- `9:16`
- `4:3`
- `3:4`
- `3:2`
- `2:3`
- `2:1`
- `1:2`

Current project ratios not directly supported by Qwen:
- `4:5`
- `5:4`
- `21:9`

Decision:
- When `QwenImage2` is selected, show only supported aspect ratios
- When `QwenImage2` is selected, hide the resolution selector completely
- Internally do not send Gemini `imageSize` fields to Qwen at all

### 10. Batch Compatibility

To do:
- Confirm batch flow can call Qwen with wallpaper reference image
- Send wallpaper reference as `image`
- Confirm output is a usable URL for:
  - preview
  - download
  - cropper
  - upscaler

Decision for first pass:
- Batch will be supported
- Use the wallpaper image as the single `image` input to Qwen
- Reuse current prompt text, but consider prompt tuning later if wallpaper placement is too creative
- Add a size guard for Qwen image input to avoid overly large data URLs

Suggested first-pass safety rule:
- If Qwen reference image data is too large for safe data URL usage, show a clear UI error instead of silently failing

## Implementation Order

1. Add Qwen model to shared types
2. Add pricing and UX labels
3. Add Replicate Qwen helpers
4. Route generation by selected model
5. Wire PromptStep and BatchGenerator
6. Handle missing token errors
7. Build and test

## Validation Checklist

- [x] `Qwen Image 2` appears in generator model selector
- [x] `Qwen Image 2` appears in batch model buttons
- [x] Selecting Qwen really routes generation to Replicate
- [x] Gemini models still route to Gemini/OpenRouter as before
- [x] Estimated cost shows `$0.035` for Qwen
- [x] Missing Replicate token shows correct error
- [x] Generated Qwen image displays correctly in result step
- [x] Qwen batch outputs can be downloaded
- [x] Qwen outputs can be sent to cropper
- [x] Qwen outputs can be sent to upscaler
- [x] `npm run build` passes

## Implementation Status

Completed in this pass:
- Added `ModelType.QwenImage2`
- Added Qwen pricing in `constants.ts`
- Added Qwen aspect-ratio constraints in UI
- Hid Gemini-only resolution selector for Qwen
- Extended `services/replicateService.ts` with Qwen generation support
- Added `services/generationRouter.ts`
- Routed generator flow through model-based dispatch
- Routed batch flow through model-based dispatch
- Added Replicate-token validation for Qwen
- Updated header helper text for Replicate token usage

Current first-pass behavior:
- Single-image Qwen generation supports prompt-only mode
- If a reference image is provided in generator mode, Qwen uses the first reference image
- Batch Qwen generation uses the wallpaper image as the single Replicate `image` input

## Risks

- Qwen image-to-image behavior may be more creative than strict wallpaper placement requires
- Existing resolution UI is Gemini-oriented and may need special handling for Qwen
- Batch prompts are currently written for Gemini behavior and may need tuning for Qwen
- Data URL reference-image flow is validated, but large wallpaper files may still require compression or later URL upload support

## Not In Scope For First Pass

- Adding `qwen/qwen-image-2-pro`
- Adding `qwen-image-2512`
- New provider selector for Replicate/Qwen
- Refactoring current provider architecture

## Follow-Up After First Integration

- Evaluate whether `qwen/qwen-image-2-pro` should be added
- Compare Qwen vs Gemini on real wallpaper mockup tasks
- Tune prompts specifically for interior wallpaper placement

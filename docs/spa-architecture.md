# The website (SPA) of this repository: architecture

The React + TypeScript site `nanabanana-one.vercel.app` (image generation, Etsy cropper, upscaler, video). It is one of the tools of the project goal (see CLAUDE.md); the content workflow does not need it. Moved out of CLAUDE.md on 2026-11-06 to keep the agent's prompt short.

## Architecture

**Nana Banana** is a React + TypeScript SPA for AI image generation, video animation, Etsy cropping and upscaling, deployed on Vercel (production: https://nanabanana-one.vercel.app). Primary use case: Etsy listing photos and video pins for children's room wallpapers targeting the German market.

In production the owner generates images and video only with Gemini models through the **Gemini provider** (direct Gemini API key entered in the header). The OpenRouter provider and Qwen Image 2 paths still exist in code but are not used.

### Data Flow

```
Images   Browser → generationRouter.ts ─┬─ provider "gemini"     → geminiService.ts → Gemini API (@google/genai, direct)
                                        ├─ provider "openrouter" → geminiService.ts → openrouter.ai chat/completions
                                        └─ model Qwen Image 2    → replicateService.ts → /api/qwen (+/poll) → Replicate
Video    Browser → VideoTool.tsx ─┬─ Omni (default) → omniService.ts → Gemini Interactions API (sync, base64 MP4)
                                  └─ Veo            → veoService.ts  → Gemini API predictLongRunning + poll
Upscale  Browser → Vercel Blob client upload (token from /api/upload) → /api/upscale (+/poll) → Replicate nightmareai/real-esrgan (default, ~$0.002) or topazlabs/image-upscale
Logs     services, Upscaler.tsx → logGeminiEvent() → /api/log-event → stdout JSON (Cloud Trace field) + Vercel Blob sessions/<sessionId>.json
                                                                     (+ gemini_sessions.json when not running on Vercel)
```

`/api/log-event` persists only the fields listed in its `DETAIL_FIELDS` (mirror of `GeminiLogDetails` in `types.ts`) — add new log fields in both places. Upscale events carry `upscaleModel` ('real-esrgan'|'topaz'), `upscaleFactor`, input/output pixel size, `predictionId`, `billingUnits` and `stage` (`upload`/`upscale`) on errors.

All AI calls except Qwen and upscaling go straight from the browser with the key from the header. `traceId` (from `utils/tracing.ts`) is sent only in the `/api/log-event` body; `formatTraceParent()` exists but no request uses it.

### Key Files

- **[App.tsx](App.tsx)** — Root component. Global state: provider, API keys, view mode, wizard step, generation state, `batchToolImage`. All five tools stay mounted and are hidden with `display: none`; `switchTab()` clears `batchToolImage` when going to Generator or Batch.
- **[types.ts](types.ts)** — Shared types: `ViewMode` (`generator|batch|cropper|upscaler|video`), `AIProvider` (`openrouter|gemini`), `ModelType` (OpenRouter-style ids, `google/` prefix stripped for the Gemini API), `VideoEngine`, `OmniResolution`, batch types.
- **[constants.ts](constants.ts)** — Model options and pricing, aspect ratios/sizes, Veo and Omni model ids, presets, negative prompt, Etsy video limits.
- **[services/generationRouter.ts](services/generationRouter.ts)** — Routes image generation to Qwen (Replicate) or to `geminiService` by model.
- **[services/geminiService.ts](services/geminiService.ts)** — Generator and Batch image generation for both providers, `detectWallCoordinates()` for the cropper's warp mode (falls back to full frame on error), `enhancePromptText()`, `logGeminiEvent()`.
- **[services/omniService.ts](services/omniService.ts)** — Gemini Omni 1.2 Flash image-to-video via `POST v1beta/interactions` (9:16, 360p draft / 720p / 1080p, 3-15 s, `duration` always sent), reads the video from `steps[].content[]`; 1080p and long clips use `delivery: uri` and the Files API (poll ACTIVE, then download).
- **[services/veoService.ts](services/veoService.ts)** — Veo 3.1 Fast image-to-video (6 s, 9:16, `allow_adult`, negative prompt; `seed` is not sent because the Gemini API rejects it).
- **[services/promptGenerator.ts](services/promptGenerator.ts)** — the ONE prompt builder for the site and for ComfyUI (through `scripts/build_batch_prompts.mjs`): `generateRandomTags()` picks values from `trends.json` (colours limited to the style's card), `buildGeminiPrompt()` assembles the long prompt, `buildBriefPrompt()` the short one. It names no style, colour or camera itself.
- **[services/replicateService.ts](services/replicateService.ts)** — Qwen generation and Topaz upscale start/poll via the `/api` routes.
- **[shared/upscaleContract.ts](shared/upscaleContract.ts)** — zod schema shared by the Upscaler and `/api/upscale*`; enums mirror the live Replicate model schema (checked by `e2e/live`). API routes must import it with a `.js` extension.
- **[services/imageCompressor.ts](services/imageCompressor.ts)** — Re-encodes uploads to JPEG ≤2048 px before they are sent to a model.
- **[services/imageCropService.ts](services/imageCropService.ts)** — Crop geometry and export helpers for legacy `EtsyCropper` (currently disabled in UI).
- **[services/exportCrop.ts](services/exportCrop.ts)** — Single module for zero-cost browser Canvas export/crop from Batch Results: `2:3` photo master → `4:5` Site/Meta (`1440×1800`) + `2:3` Pinterest (`1000×1500`) + `1:1` Meta (`1080×1080`), while `9:16` video masters stay `1080×1920`; includes `/api/kie` (`action: 'fetchImage'`) CORS relay fallback.
- **[services/macroTexture.ts](services/macroTexture.ts)** — Single module for the `"Macro Texture in Interior"` Batch card and Craft Lambda sand-grain reference (`REFERENCE_IMAGE_2`); standard rooms strictly send 1 reference (wallpaper 1:1).
- **[services/batchImageStore.ts](services/batchImageStore.ts)** — IndexedDB storage for Batch 2K result images (avoids `localStorage` quota overflow and reload hangs).
- **[shared/modelContracts.ts](shared/modelContracts.ts)** — Single Zod capability & billing registry for Gemini, KIE (`Nano Banana 2.1`, `GPT Image 2`, `Grok Imagine 2.0`, `Kling 2.6`), and Replicate (`Qwen Image 2`).
- **[services/downloadService.ts](services/downloadService.ts)** — Blob-based download helper (avoids cross-origin download issues).
- **[services/sessionTracker.ts](services/sessionTracker.ts)** — Per-page-load session id (`sess_*`) used to group logs.
- **[hooks/useBatch.ts](hooks/useBatch.ts)** — All Batch state, master-format scaling (`2:3` photo + `9:16` video), export preset selection (`pack_4x5_2x3` default), and IndexedDB hydration.
- **[api/](api/)** — `kie.ts` (KIE proxy + allowlisted `fetchImage` CORS relay), `upscale.ts` + `upscale/poll.ts` (Replicate proxy, client token in `Authorization`), `upload.ts` (Vercel Blob client tokens), `log-event.ts` (structured Cloud Logging + `spanId`, token/cost/timing fields, secret redaction), `list-sessions.ts`, `qwen.ts` + `qwen/poll.ts`.
- **[.agents/skills/log-trace-debugger/SKILL.md](.agents/skills/log-trace-debugger/SKILL.md)** — Project-scoped skill for trace-based log analysis and debugging API errors.
- **[Promt/trends.json](Promt/trends.json)** — THE single source of styles and variables for the site and the boards: `styles` (cards: signature, suitable colours, what to avoid), colors, brands, age groups, key objects, room zones, lighting, camera pools, accessories, materials, `realism` (the real-photograph line), `negatives` (the Avoid list), German apartment context, `latestMarketInsights` (measured, every entry with its source). Guard against styles leaking into code: `comfy_nodes/test_trends_single_source.py` (acceptance of builder changes, not a routine run).
- **[Promt/Promt.md](Promt/Promt.md)** — Prompt rules; `trends.json` + `promptGenerator.ts` are the source of truth (Rule #6).

### Component Structure

```
App.tsx
├── Header.tsx              — Provider selector (OpenRouter/Gemini), key for the active provider, Replicate token
├── Generator:
│   ├── WizardSteps.tsx     — Step indicator (Prompt → Reference → Result)
│   ├── PromptStep.tsx      — Prompt, ✨ Enhance, model, aspect ratio, resolution (512/1K/2K/4K)
│   ├── ReferenceStep.tsx   — Up to 5 reference images (ImageUploader.tsx)
│   └── ResultStep.tsx      — Result, cost/tokens, download, "✂️ Etsy Cropper"
├── Batch:
│   └── BatchGenerator.tsx  — 3-step wizard (logic in hooks/useBatch.ts): Setup → Review Prompts → Results
│       Setup: wallpaper, count 3/6/9/12/15, 2 master ratios (2:3 photo + 9:16 video; extra ratios collapsed), macro texture toggle, model
│       Results: export preset selector (default 4:5 + 2:3 pack via services/exportCrop.ts), per-card export, ✨ Refine (2K, Pro), ↑ Scale, 🎬 Animate, regenerate
├── Cropper (disabled in UI):
│   └── EtsyCropper.tsx     — Legacy wall-detection warp / Etsy cropper (commented out in UI)
├── Upscale:
│   └── Upscaler.tsx        — Real-ESRGAN (default, ~$0.002) / Topaz via Replicate: 8K/16K/24K → 2x/4x/6x, subject detection (Topaz), JPG/PNG
└── Video:
    └── VideoTool.tsx       — Omni 1.2 Flash (default) or Veo 3.1 Fast, clip length and resolution pickers, presets, editable prompt, Etsy ≥500 px check
```

### Batch Generator — Key Design Decisions

- Model per batch: Gemini 3.1 Flash (default), Gemini 3 Pro, Nano Banana 2.1 (KIE), GPT Image 2 (KIE), Grok Imagine 2.0 (KIE), ABTest, or Qwen 2; images are requested at `2K`.
- **Two-master format & zero-cost Canvas export (`services/exportCrop.ts`):** Photos are generated once in `2:3` (~1696×2528) and cropped client-side on download into `4:5` (`1440×1800` for Site, Google Shopping, Meta Feed/Carousel — trimming 8.3% top/bottom only, keeping 100% wall width) and `2:3` (`1000×1500` for Pinterest) or `1:1` (`1080×1080`). Video masters stay `9:16` (`1080×1920`).
- **Clean 1-ref rooms + dedicated Macro card (`services/macroTexture.ts`):** Standard rooms send ONLY 1 reference (the wallpaper 1:1) to avoid artwork contamination. When `"Макро-кадр фактуры в интерьере"` is enabled, 1 card is assigned `macroTexture: true` and attaches the clean `460×460` Craft Lambda sand-grain crop (`services/craftLambdaAsset.ts`).
- Cards generate in chunks of 2 with `Promise.allSettled`; 2K result data URLs are stored in IndexedDB (`services/batchImageStore.ts`).
- Text overlays (USP / promo brushstrokes) are disabled (`ENABLE_USP_OVERLAYS = false`).

### Video Animator — Key Design Decisions

- Default engine: **Gemini Omni 1.2 Flash** (`gemini-omni-1.2-flash`) via Google Interactions API (`POST /v1beta/interactions`), sync response returning Base64 MP4 (or a Files API link for 1080p / long clips).
- 4 Specialized Etsy & Pinterest presets: `omni_wall_dolly`, `omni_texture_macro`, `omni_sunlight_loop`, `omni_montessori`.
- **Inanimate 2D Print Lock**: strict prompt constraint preventing biological animation, morphing, and duplicate animal heads during camera movement. Camera uses pure optical macro push-in (Z-axis zoom) rather than lateral gliding.

### AI Models in Use

| Model | Used For |
|---|---|
| `gemini-3.1-flash-image` | Fast image generation; also wall detection and ✨ Enhance on the Gemini provider |
| `gemini-3-pro-image` | High-quality generation (up to 4K), batch ✨ Refine |
| `gemini-omni-1.2-flash` | Default video engine (Interactions API, 360p/720p/1080p, 3-15 s) |
| `veo-3.1-fast-generate-preview` | Alternative video engine |
| `google/gemini-2.5-flash` (OpenRouter) | ✨ Enhance on the OpenRouter provider |
| `qwen/qwen-image-2` (Replicate) | Optional image model, unused in production |
| `nightmareai/real-esrgan` (Replicate) | Fast & ultra-cheap upscaling (~$0.002/run, default) |
| `topazlabs/image-upscale` (Replicate) | High-fidelity upscaling with subject detection (~$0.048/billing unit) |

### State Management

React `useState` only. Provider and all keys (`openrouter_api_key`, `gemini_api_key`, `replicate_token`) are persisted in `localStorage`; Batch state is persisted by `useBatch`. When `localStorage` has no key, `App.tsx` falls back to env values that `vite.config.ts` inlines via `define`.

### Postman Integration

- **[Nana_Banana_API.postman_collection.json](Nana_Banana_API.postman_collection.json)** — Collection for the session logger, Qwen and Topaz upscaler endpoints.

### Deployment

Vercel: `npm run build` → `dist/`, functions in `/api` (`vercel.json` sets `maxDuration` 30 s for upscale, 60 s for poll) and all non-API routes rewrite to `index.html`.

Server env: `BLOB_READ_WRITE_TOKEN` is required for Upscaler uploads and session logs; `REPLICATE_API_TOKEN` is used only by `/api/qwen*`. **Do not set `GEMINI_API_KEY`, `GEMINI_VEO_API_KEY`, `OPENROUTER_API_KEY` or `REPLICATE_API_TOKEN` for production builds**: `vite.config.ts` inlines them into the public JS bundle.

### Known Issues (covered by failing e2e tests, 2026-09-14)

Remove an entry once its test passes.

- `EtsyCropper` keeps drawing and exporting the previously loaded image (the Unsplash placeholder) after a new source — `imgRef` is reused.
- `Upscaler` and `EtsyCropper` read `initialImage` only on mount, so Generator/Batch hand-offs do not arrive.
- Generator: `GEMINI_NEGATIVE_PROMPT` is placed in `imageConfig.negativePrompt`, which `@google/genai` drops; OpenRouter requests never include it. Batch prompts are unaffected (their negatives are in the text).
- Batch persists 2K results to `localStorage`; after the quota is hit, a reload restores cards stuck in "Generating...".
- Production security: provider keys in the bundle, `/api/list-sessions` is public, `/api/qwen` runs on the server token without auth, `/api/qwen/poll` passes `../` into the Replicate URL.

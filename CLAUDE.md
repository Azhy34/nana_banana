# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Vite dev server on http://localhost:3000 (no /api routes)
npx vercel dev    # Dev server including the /api serverless functions
npm run build     # Production build (outputs to dist/)
npm run preview   # Preview production build locally

npm run test:e2e        # Playwright: ui (all AI providers mocked) + api, against a local keyless build
npm run test:e2e:prod   # same suites against https://nanabanana-one.vercel.app (no paid calls)
npm run test:e2e:live   # free read-only checks with real keys from .env.local (key validity, model access)
```

E2E tests live in `e2e/` (`support/fixtures.ts` blocks every unmocked request to OpenRouter, Gemini, Replicate, Vercel Blob and `/api/*`). No linter is configured.

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
Upscale  Browser → Vercel Blob client upload (token from /api/upload) → /api/upscale (+/poll) → Replicate topazlabs/image-upscale
Logs     services, Upscaler.tsx → logGeminiEvent() → /api/log-event → stdout JSON (Cloud Trace field) + Vercel Blob sessions/<sessionId>.json
                                                                     (+ gemini_sessions.json when not running on Vercel)
```

`/api/log-event` persists only the fields listed in its `DETAIL_FIELDS` (mirror of `GeminiLogDetails` in `types.ts`) — add new log fields in both places. Upscale events carry `upscaleFactor`, input/output pixel size, `predictionId`, `billingUnits` and `stage` (`upload`/`upscale`) on errors.

All AI calls except Qwen and upscaling go straight from the browser with the key from the header. `traceId` (from `utils/tracing.ts`) is sent only in the `/api/log-event` body; `formatTraceParent()` exists but no request uses it.

### Key Files

- **[App.tsx](App.tsx)** — Root component. Global state: provider, API keys, view mode, wizard step, generation state, `batchToolImage`. All five tools stay mounted and are hidden with `display: none`; `switchTab()` clears `batchToolImage` when going to Generator or Batch.
- **[types.ts](types.ts)** — Shared types: `ViewMode` (`generator|batch|cropper|upscaler|video`), `AIProvider` (`openrouter|gemini`), `ModelType` (OpenRouter-style ids, `google/` prefix stripped for the Gemini API), `VideoEngine`, `OmniResolution`, batch types.
- **[constants.ts](constants.ts)** — Model options and pricing, aspect ratios/sizes, Veo and Omni model ids, presets, negative prompt, Etsy video limits.
- **[services/generationRouter.ts](services/generationRouter.ts)** — Routes image generation to Qwen (Replicate) or to `geminiService` by model.
- **[services/geminiService.ts](services/geminiService.ts)** — Generator and Batch image generation for both providers, `detectWallCoordinates()` for the cropper's warp mode (falls back to full frame on error), `enhancePromptText()`, `logGeminiEvent()`.
- **[services/omniService.ts](services/omniService.ts)** — Gemini Omni 1.1 Flash image-to-video via `POST v1beta/interactions` (9:16, 720p final / 360p draft), reads the video from `steps[].content[]`.
- **[services/veoService.ts](services/veoService.ts)** — Veo 3.1 Fast image-to-video (6 s, 9:16, `allow_adult`, negative prompt; `seed` is not sent because the Gemini API rejects it).
- **[services/promptGenerator.ts](services/promptGenerator.ts)** — `generateRandomTags()` picks values from `trends.json`; `buildGeminiPrompt()` assembles the narrative batch prompt, including its own "Absolutely avoid: …" list.
- **[services/replicateService.ts](services/replicateService.ts)** — Qwen generation and Topaz upscale start/poll via the `/api` routes.
- **[shared/upscaleContract.ts](shared/upscaleContract.ts)** — zod schema shared by the Upscaler and `/api/upscale*`; enums mirror the live Replicate model schema (checked by `e2e/live`). API routes must import it with a `.js` extension.
- **[services/imageCompressor.ts](services/imageCompressor.ts)** — Re-encodes uploads to JPEG ≤2048 px before they are sent to a model.
- **[services/imageCropService.ts](services/imageCropService.ts)** — Crop geometry and export helpers for `EtsyCropper`.
- **[services/downloadService.ts](services/downloadService.ts)** — Blob-based download helper (avoids cross-origin download issues).
- **[services/sessionTracker.ts](services/sessionTracker.ts)** — Per-page-load session id (`sess_*`) used to group logs.
- **[hooks/useBatch.ts](hooks/useBatch.ts)** — All Batch state and handlers; persists step, wallpaper and cards to `localStorage`.
- **[api/](api/)** — `upscale.ts` + `upscale/poll.ts` (Replicate proxy, client token in `Authorization`), `upload.ts` (Vercel Blob client tokens), `log-event.ts`, `list-sessions.ts` (returns all logged sessions), `qwen.ts` + `qwen/poll.ts` (use the server `REPLICATE_API_TOKEN`).
- **[.agents/skills/log-trace-debugger/SKILL.md](.agents/skills/log-trace-debugger/SKILL.md)** — Project-scoped skill for trace-based log analysis and debugging API errors.
- **[Promt/trends.json](Promt/trends.json)** — Data for random prompt tags (colors, styles, brands, age groups, key objects, room zones, lighting, camera, depth of field, accessories, materials, German apartment context, `latestMarketInsights`). Its `negativePrompt` key is not read by the code.
- **[Promt/Promt.md](Promt/Promt.md)** — Prompt rules; `buildGeminiPrompt()` is the source of truth.

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
│       Setup: wallpaper, count 6/9/12/15, format distribution 9:16/2:3/4:3 (default 6/4/2), model
│       Results: per-card download, ✨ Refine (2K, Pro), ↑ Scale, ✂ Cropper, 🎬 Video (9:16 only), regenerate
├── Cropper:
│   └── EtsyCropper.tsx     — Canvas crops to Etsy presets (3000×2250 etc.), batch mode, wall-detection warp mode
├── Upscale:
│   └── Upscaler.tsx        — Topaz via Replicate: 8K/16K/24K → 2x/4x/6x, subject detection, JPG/PNG
└── Video:
    └── VideoTool.tsx       — Omni 1.1 Flash (default) or Veo 3.1 Fast, presets, editable prompt, Etsy ≥500 px check
```

### Batch Generator — Key Design Decisions

- Model per batch: 3.1 Flash (default), 3 Pro, 50/50 split (first half Pro, second half Flash) or Qwen 2; images are requested at `2K`.
- Cards generate in chunks of 2 with `Promise.allSettled`; each result updates its card through functional `setCards(prev => ...)`.
- ✨ Refine sends the card result as a draft plus the wallpaper to 3 Pro at 2K.
- Text overlays (USP / promo brushstrokes) are disabled: `generateCards()` clears `overlayText`, although `buildGeminiPrompt()` still supports it.
- `batchToolImage` in `App.tsx` carries a result to Cropper/Upscaler/Video.

### AI Models in Use

| Model | Used For |
|---|---|
| `gemini-3.1-flash-image` | Fast image generation; also wall detection and ✨ Enhance on the Gemini provider |
| `gemini-3-pro-image` | High-quality generation (up to 4K), batch ✨ Refine |
| `gemini-omni-1.1-flash` | Default video engine (Interactions API) |
| `veo-3.1-fast-generate-preview` | Alternative video engine |
| `google/gemini-2.5-flash` (OpenRouter) | ✨ Enhance on the OpenRouter provider |
| `qwen/qwen-image-2` (Replicate) | Optional image model, unused in production |
| `topazlabs/image-upscale` (Replicate) | Upscaling to 8K/16K/24K |

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

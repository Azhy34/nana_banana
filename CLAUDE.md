# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server on http://localhost:3000
npm run build     # Production build (outputs to dist/)
npm run preview   # Preview production build locally
```

No test runner or linter is configured.

## Architecture

**Nana Banana** is a React + TypeScript SPA for AI image generation, cropping, and upscaling, deployed on Vercel. Primary use case: generating Etsy product listing photos for children's room wallpapers targeting the German market.

### Data Flow

```
Browser (React) → geminiService.ts (traceId) → Google Gemini API (direct)
                → log-event API (background) → /api/log-event (JSON log with traceId) → gemini_sessions.json
                → veoService.ts (traceId) → Google Veo API (direct video generation + poll status + log start/success/error)
                → replicateService.ts → /api/upscale (Vercel proxy) → Replicate.com / Topaz Labs
```

The Vercel API routes (`/api`) exist as CORS proxies to Replicate, and a `/api/log-event` background logger. Gemini is called directly from the browser for stability. Log tracing context propagates via W3C traceparent headers.

### Key Files

- **[App.tsx](App.tsx)** — Root component. Holds global state (API keys, view mode, wizard step, generation state, `batchToolImage`). Tab switching uses `switchTab()` which clears `batchToolImage` when leaving batch flow to prevent stale images in Cropper/Upscaler.
- **[types.ts](types.ts)** — All shared TypeScript types: `Step`, `ViewMode` (`generator|cropper|upscaler|batch`), `ModelType`, `AspectRatio`, `BatchCard`, `BatchPromptTags`, `BatchAspectRatio`, `AgeGroupKey`
- **[services/geminiService.ts](services/geminiService.ts)** — `generateImageComposition()` for Generator mode; `generateBatchImage()` for Batch mode (wallpaper as reference + custom prompt); `detectWallCoordinates()` for EtsyCropper wall detection; sends background log telemetry
- **[services/sessionTracker.ts](services/sessionTracker.ts)** — Tracks/generates unique client session IDs (`sess_*`) per page session to organize logs.
- **[gemini_sessions.json](gemini_sessions.json)** — Generated local JSON file containing structured session logs for subsequent AI agent analysis (dev mode only).
- **[services/promptGenerator.ts](services/promptGenerator.ts)** — `generateRandomTags(aspectRatio)` picks random values from `trends.json`; `buildGeminiPrompt(tags)` assembles the final English prompt string; exports `TAG_OPTIONS` and `AGE_GROUP_LABELS` for dropdowns
- **[services/replicateService.ts](services/replicateService.ts)** — Replicate/Topaz upscaling: starts job, polls for completion, returns result URL
- **[services/downloadService.ts](services/downloadService.ts)** — Blob-based download helper (avoids cross-origin download issues)
- **[api/upscale.ts](api/upscale.ts)** — Vercel serverless POST handler; proxies to Replicate
- **[utils/tracing.ts](utils/tracing.ts)** — Helper for generating traceId, spanId, and W3C `traceparent` headers for distributed tracing.
- **[.agents/skills/log-trace-debugger/SKILL.md](.agents/skills/log-trace-debugger/SKILL.md)** — Project-scoped skill for trace-based log analysis and debugging API errors.
- **[Promt/trends.json](Promt/trends.json)** — Data source for random prompt generation: colors, styles, furniture brands, age groups, key objects, room zones, lighting, camera angles/distances, depth of field, accessories, German apartment context, negative prompt
- **[Promt/Promt.md](Promt/Promt.md)** — Rules for prompt generation: wallpaper preservation rules, random variable algorithm, final prompt template

### Component Structure

```
App.tsx
├── Header.tsx              — API key inputs (Gemini key + Replicate token)
├── Generator mode:
│   ├── WizardSteps.tsx     — Step indicator (Prompt → Reference → Result)
│   ├── PromptStep.tsx      — Prompt text, model selection, aspect ratio
│   ├── ReferenceStep.tsx   — Optional reference image upload
│   └── ResultStep.tsx      — Shows generated image, download, crop, upscale actions
├── Batch mode:
│   └── BatchGenerator.tsx  — 3-step wizard: Setup → Prompt Cards → Results
│       Step 1: upload wallpaper, choose count (6/9/12/15), set format distribution (9:16/2:3/4:3)
│       Step 2: editable prompt cards — each card has TAG_KEYS selects + accessories + full prompt textarea
│       Step 3: results grid — parallel generation, per-card download/upscale/crop/regenerate
├── Cropper mode:
│   └── EtsyCropper.tsx     — Canvas-based cropping tool; Etsy-standard 3000×2250px+; Gemini vision wall detection
└── Upscaler mode:
    └── Upscaler.tsx        — Replicate/Topaz upscaling UI (2×/4×/6×, model presets, face enhancement)
```

### Batch Generator — Key Design Decisions

- `generateBatchImage()` sends wallpaper as `inlineData` part + prompt text to `ModelType.Pro` at `2K` resolution
- All cards generate in parallel via `Promise.allSettled` — each callback uses functional `setCards(prev => ...)` to safely update individual card state from async context
- `batchToolImage` in `App.tsx` holds the image sent from Batch results to Cropper/Upscaler; cleared by `switchTab()` when navigating to Generator or Batch
- Prompt structure (from `Promt/Promt.md`): starts with explicit reference image role declaration, then Subject/Location/Action/Camera/Lighting per Google Nano Banana Pro prompting guide
- **A/B Testing Text Overlays:** Automatically selects ~30% of generated cards during card creation and assigns a marketing USP/Promo Code and corner position (`bottom left`/`bottom right`). The `buildGeminiPrompt` function appends instructions to generate a small matching color watercolor brushstroke underlay with readable cursive handwritten text.

### AI Models in Use

| Model | Used For |
|---|---|
| `gemini-3.1-flash-image` (Flash) | Fast image generation / editing |
| `gemini-3-pro-image` (Pro) | High-quality generation, Batch mode (2K) |
| `gemini-2.0-flash` | Vision tasks (wall detection in EtsyCropper) |
| `topazlabs/image-upscale` via Replicate | Image upscaling up to 16K |

### State Management

State lives in React `useState` hooks in `App.tsx` and individual components — no external state library. API keys are stored in component state (Gemini) and `localStorage` (Replicate token).

### Postman Integration

- **[Nana_Banana_API.postman_collection.json](Nana_Banana_API.postman_collection.json)** — Global Postman collection to test and log API endpoints, including the session background logger, Qwen, and Topaz upscaler.

### Deployment

Configured for Vercel. Serverless functions in `/api` are auto-deployed. The `vercel.json` rewrites all non-API routes to `index.html` for SPA routing. The `BLOB_READ_WRITE_TOKEN` environment variable enables optional Vercel Blob storage (used by `api/upload.ts`).

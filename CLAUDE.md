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

**Nana Banana** is a React + TypeScript SPA for AI image generation, cropping, and upscaling, deployed on Vercel.

### Data Flow

```
Browser (React) → geminiService.ts → Google Gemini API (direct)
                → replicateService.ts → /api/upscale (Vercel proxy) → Replicate.com / Topaz Labs
```

The Vercel API routes (`/api`) exist solely as CORS proxies to Replicate. Gemini is called directly from the browser.

### Key Files

- **[App.tsx](App.tsx)** — Root component. Holds global state (API keys, view mode, wizard step, generation state). Manages view switching between `generator`, `cropper`, and `upscaler` modes.
- **[types.ts](types.ts)** — All shared TypeScript types and enums (`Step`, `ViewMode`, `ModelType`, `AspectRatio`, etc.)
- **[constants.ts](constants.ts)** — App-wide constants
- **[services/geminiService.ts](services/geminiService.ts)** — Google Gemini integration: `generateImageComposition()` and `detectWallCoordinates()` (used by EtsyCropper for wall detection via vision AI)
- **[services/replicateService.ts](services/replicateService.ts)** — Replicate/Topaz upscaling: starts job, polls for completion, returns result URL
- **[services/downloadService.ts](services/downloadService.ts)** — Blob-based download helper (avoids cross-origin download issues)
- **[api/upscale.ts](api/upscale.ts)** — Vercel serverless POST handler; proxies to Replicate
- **[api/upscale/](api/upscale/)** — Contains poll endpoint (`?id=`) for checking upscale job status

### Component Structure

```
App.tsx
├── Header.tsx              — API key inputs (Gemini key + Replicate token)
├── Generator mode:
│   ├── WizardSteps.tsx     — Step indicator (Prompt → Reference → Result)
│   ├── PromptStep.tsx      — Prompt text, model selection, aspect ratio
│   ├── ReferenceStep.tsx   — Optional reference image upload
│   └── ResultStep.tsx      — Shows generated image, download, crop, upscale actions
├── Cropper mode:
│   └── EtsyCropper.tsx     — Canvas-based cropping tool (927 lines); produces Etsy-standard 3000×2250px+ crops; uses Gemini vision for wall detection
└── Upscaler mode:
    └── Upscaler.tsx        — Replicate/Topaz upscaling UI (2×/4×/6×, model presets, face enhancement)
```

### AI Models in Use

| Model | Used For |
|---|---|
| `gemini-2.5-flash-image` (Flash) | Fast image generation / editing |
| `gemini-3-pro-image-preview` (Pro) | High-quality generation, reference image composition |
| `gemini-2.0-flash` | Vision tasks (wall detection in EtsyCropper) |
| `topazlabs/image-upscale` via Replicate | Image upscaling up to 16K |

### State Management

State lives in React `useState` hooks in `App.tsx` and individual components — no external state library. API keys are stored in component state (Gemini) and `localStorage` (Replicate token).

### Deployment

Configured for Vercel. Serverless functions in `/api` are auto-deployed. The `vercel.json` rewrites all non-API routes to `index.html` for SPA routing. The `BLOB_READ_WRITE_TOKEN` environment variable enables optional Vercel Blob storage (used by `api/upload.ts`).

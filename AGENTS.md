# AI Agents Changelog & Architectural Decisions

This file tracks significant changes, architectural decisions, and logic updates implemented by AI agents (Gemini/Claude) in the `nana_banana` project. This helps maintain context across sessions and different agents.

## [2026-09-21] Full-Height Wallpaper Enforcement & Evergreen Listing USPs (Selective 4:3 / 2:3 Overlays)

### 1. Motivation & Half-Wall Issue Fix
- **Problem:** In batch generations (e.g. `2:3` and `4:3`), Gemini was occasionally hallucinating "two-tone" walls or "half-height wallpaper" (Halbhoch tapezieren) where wallpaper only covered the top half of the wall, leaving the bottom half plain white behind desks or beds.
- **Solution:** 
  - Added explicit positive constraint in `services/promptGenerator.ts`: *"FULL-HEIGHT 100% WALL COVERAGE: It is strictly mandatory that this entire reference image is mapped and stretched onto the feature wall from edge to edge, as a single, continuous, seamless mural covering 100% of the wall surface from the absolute ceiling line all the way down to the floor/baseboards, continuing solidly behind the desk, bed, and all furniture without any horizontal cut, split, wainscoting, or unpapered lower section."*
  - Added strict negative constraints against half-walls across both `services/promptGenerator.ts` and `services/geminiService.ts` (`GEMINI_NEGATIVE_PROMPT`): `half-wall wallpaper, half-height wallpaper, halbhoch tapeziert, two-tone wall, split wall, horizontally divided wall, wainscoting, wall paneling, beadboard, dado rail, chair rail, lower wall unpapered, partial wall coverage, wallpaper border, plain bottom half, split paint`.

### 2. Video vs. Listing Separation & Evergreen English USPs
- **Separation:**
  - `9:16` format is kept **100% clean** (`overlayText = undefined`) to ensure flawless, artifact-free video animations in Veo/Omni.
  - `4:3` and `2:3` formats randomly receive a curated watercolor brushstroke USP badge on ~35% of listing photo cards.
- **Evergreen English USPs:** Replaced hardcoded expiring discount coupons (e.g. `5% OFF: MOONPIN5`) with timeless, high-converting product quality and safety selling points:
  - `Custom Sizes Available`
  - `100% Toxin-Free & Odorless`
  - `Washable & Easy Clean`
  - `Easy Paste-the-Wall`
  - `Premium Tactile Texture`
  - `Certified EU Quality`
- **Dynamic Negative Prompt:** `services/promptGenerator.ts` now dynamically excludes `text overlay, promotional text, watercolor patch` from negative constraints when `overlayText` is active on a card.

## [2026-09-16] Multimodal Material Texture Conditioning (Gemini Direct API & Craft Lambda)

### 1. Motivation & Aesthetic Goals
- **Problem:** When generating mockups from a 2D wallpaper graphic file, the resulting wall often appears flat or digitally smooth without the tactile character of real wallpaper material.
- **Solution:** Integrated physical wallpaper macro-reference `Craft_Lambda.jpg` (270 KB optimized asset with sand grain micro-relief and non-woven fleece texture) directly into the Gemini Batch Generator (`BatchGenerator.tsx`, `useBatch.ts`, `services/geminiService.ts`).

### 2. Multi-Image Conditioning Architecture (ai.google.dev specification)
- **Direct Gemini API (@google/genai):** Uses native multi-image conditioning (`contents.parts`):
  - `REFERENCE_IMAGE_1` (`WALLPAPER_GRAPHIC_DESIGN`): Wallpaper user artwork (transfers pattern, colors, shapes 1:1).
  - `REFERENCE_IMAGE_2` (`MATERIAL_TEXTURE_MACRO`): Real macro photo of Craft Lambda non-woven sand paper. Explicit instruction directs Gemini 3.1 to extract *only* surface relief, sand grain texture, and ultra-matte chalky finish under natural daylight, while strictly ignoring and discarding any graphic art (e.g. gold leaves) from the texture reference.
- **In-Memory Zero-Latency Asset:** Created `services/craftLambdaAsset.ts` and `public/textures/craft_lambda.jpg` providing instant synchronous Base64 access without runtime disk or network overhead.
- **UI Control:** Added interactive toggle card with thumbnail preview on the Batch Generator setup screen, persisted in `localStorage`.
- **Gemini Omni 1.1 Video Stabilization (Inanimate 2D Print Lock):** Fixed animal head duplication / morphing during macro camera moves (`omni_texture_macro`). Replaced lateral camera gliding with pure optical macro push-in (zoom straight along Z-axis) and added mandatory negative semantic constraint: *"INANIMATE 2D PRINT LOCK: The artwork is strictly flat, static ink printed on paper. Zero biological animation, zero head turns, zero duplicate heads, zero extra limbs, zero morphing."*

## [2026-09-14] Dual-Model Upscaler Architecture (Real-ESRGAN & Topaz Labs)

### 1. Motivation & Unit Economics
- **Problem:** `topazlabs/image-upscale` is billed dynamically per GPU-unit (~$0.048 / unit). Upscaling wallpaper to 16K consumes ~17 units (~$0.82 / image), creating high operational cost for standard draft and preview upscale runs.
- **Solution:** Added `nightmareai/real-esrgan` as the primary (default) upscaler model. It runs in ~2-4s on Nvidia A100 GPU and costs ~$0.002 / image (~0.2 cents) — over 400x cheaper. Topaz Labs remains accessible via an interactive toggle for final studio-grade prints.

### 2. Implementation Details
- **Contract (`shared/upscaleContract.ts`):** 
  - Added `UPSCALE_MODELS = ['real-esrgan', 'topaz'] as const`.
  - Added `model` enum field to `upscaleRequestSchema` (defaulting to `'real-esrgan'`).
  - Added conditional formatting in `toReplicateInput`: for `real-esrgan` extracts numeric `{ image, scale: 2|4|6, face_enhance: false }`; for `topaz` passes Topaz-specific parameters (`enhance_model`, `subject_detection`, etc.).
- **API Routing (`api/upscale.ts`):**
  - Selects Replicate model endpoint dynamically: `parsed.data.model === 'real-esrgan' ? REAL_ESRGAN_API_URL : TOPAZ_API_URL`.
- **UI (`components/Upscaler.tsx`):**
  - Added interactive model selector cards with badges ("Экономно ~$0.002" vs "High Quality ~$0.82").
  - Dynamically hides Topaz-exclusive `subjectDetection` controls when Real-ESRGAN is selected.
  - Progress bar dynamically displays estimated run cost.
- **Logging Pipeline:**
  - `types.ts` & `api/log-event.ts`: added `upscaleModel?: string` to `GeminiLogDetails` and `DETAIL_FIELDS`.
  - Upscale logs record `activeModelId` (`nightmareai/real-esrgan` or `topazlabs/image-upscale`) and cost ($0.002 vs actual Topaz billing units).
- **Quality & Testing:**
  - `e2e/ui/upscaler-cropper.spec.ts`: Added automated Playwright test for Real-ESRGAN flow ($0.002 cost check, scale factor payload, UI visibility). Updated Topaz test to explicitly select Topaz model.
  - `e2e/api/contract.spec.ts`: Verified contract schema validation and invalid model rejection.
  - Fixed `EtsyCropper.tsx` bug where replacing photo did not reload image canvas.

## [2026-05-19] Batch Generator Overhaul & Prompt Engineering

### 1. Aspect Ratio Optimization for Etsy
- **Decision:** Replaced the `1:1` and `16:9` aspect ratios with `4:3` and `2:3` in the Batch Generator. 
- **Reasoning:** Etsy strongly recommends `4:3` (e.g., 2000x1500px) for primary listing thumbnails to provide wider room context. `2:3` provides excellent vertical detail shots. The new default batch distribution is 6x `9:16`, 4x `2:3`, and 2x `4:3`.

### 2. Gemini Prompt Realism Upgrade (Narrative Prompting)
- **Decision:** Rewrote the `buildGeminiPrompt` function from a "keyword list" format to a cohesive "narrative paragraph" format.
- **Additions:**
  - **Strict 1:1 Enforcement:** Added absolute phrasing to ensure the reference wallpaper pattern is applied without any alteration or recoloring.
  - **Positive Semantic Constraints:** Replaced the `Negative prompt` section with positive constraints (e.g., "completely devoid of plastic... maintaining a premium and flawless look") as Gemini responds better to positive framing.
  - **Dynamic Composition (`compositionStrategy`):** Introduced a 40% chance for an "unobstructed" composition (keeping furniture low to show the wall) and a 60% chance for a natural "child-scale" camera height.
  - **Cinematic Details (`cinematicDetail`):** Added a random pool of 7 lighting/foreground effects (e.g., dappled sunlight, blurred foreground canopy) to ensure batch generations do not look repetitive.
  - **Physical Lighting Interaction:** Added instructions for light to "graze the wallpaper" creating ambient occlusion, preventing the wall from looking like a flat 2D Photoshop overlay.

### 3. Architectural Refactoring: `useBatch.ts`
- **Decision:** Extracted all state management, image processing, and event handler logic from `BatchGenerator.tsx` into a custom hook `hooks/useBatch.ts`.
- **Reasoning:** `BatchGenerator.tsx` had become a "God Component" handling complex state and a 3-step wizard UI. This separation of concerns (Business Logic vs. UI) makes the component purely responsible for rendering and drastically improves maintainability.

## Debugging & Log Analysis Rules

- **Trigger:** Если пользователь просит проверить логи, выяснить причину ошибки/сбоя, проанализировать API-запросы или при фразах "почему ошибка?", "в чем проблема?" и подобных, вы **обязаны** первым делом прочитать инструкции в локальном скилле:
  [log-trace-debugger](file:///.agents/skills/log-trace-debugger/SKILL.md)
  и действовать строго по описанному там регламенту.

## [2026-07-13] Trend Auditing & SEO Optimization Pipeline

### 1. Trend Tracking Database
- **Location:** [Promt/trends.json](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/Promt/trends.json) contains the active database of styles, colors, materials, and keyObjects used to enrich wallpaper generator prompts.
- **Goal:** Periodically update this database with fresh market data (USA, Germany, EU) to enrich prompts for wallpaper generation, design styles, and SEO listings.

### 2. Market Trend Analysis Scripts
- **OpenRouter Analyst Script:** [scripts/analyze_market_trends.cjs](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/scripts/analyze_market_trends.cjs) queries Gemini via OpenRouter using core SEO keywords over the last 90 days (USA & EU) and updates the trends database dynamically.
- **Google Trends RSS Script:** [scripts/fetch_google_trends_rss.cjs](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/scripts/fetch_google_trends_rss.cjs) demonstrates how to safely retrieve real-time daily trending search feeds from Google Trends without requiring API keys.

### 3. Etsy Listings Trend Catalog
- **Location:** [C:\Users\Mikhail\OneDrive\nocode\Etsy\listings_trend_catalog.md](file:///C:/Users/Mikhail/OneDrive/nocode/Etsy/listings_trend_catalog.md) maps all 27+ active listings to their respective design themes, trend status (Hot, Stable, Declining), and action plans.
- **Rule:** Future agents must keep this catalog updated when adding new listings or modifying styles. Use this catalog to audit low-performing or declining designs (e.g. replacing basic geometric mountains/balloons with high-volume biophilic forests/Japandi arches) and optimize their SEO metadata.

## [2026-07-13 - Part 2] Nursery Realism & Psychology Guidelines

### 1. Child Psychology & Age-Appropriate Attributes
- **Decision:** Mapped specific furniture assets to children's age groups in `trends.json` and programmatically enforced them in `promptGenerator.ts`.
- **Enforcements:**
  - **Baby (0-3 years):** Force a classic wooden crib with slatted sides and a changing table dresser (`Wickelkommode`) with a changing mat. Use desaturated, low-contrast pastel tones to prevent sensory overstimulation.
  - **Preschool (3-6 years):** Montessori floor bed, small children's play table and two chairs.
  - **School Child (6-10 years):** Low wooden bed, compact desk, chair, desk lamp, and cozy reading floor cushion.
  - **Teenager (10-16 years):** Platform bed, writing desk, modular bookshelves.

### 2. Elimination of AI Hallmarks (Wicker Baskets Ban)
- **Decision:** Banned wicker, straw, and rattan baskets from both the positive accessories list and negative prompts.
- **Reasoning:** AI image generators often struggle with rendering woven materials, resulting in asymmetric and warped textures that scream "AI-generated". We replaced these with solid wood toy boxes and organic linen canvas bags, which render cleanly.

### 3. Lighting Design & Coziness
- **Decision:** Removed overcast, gray, or cool light presets (like "overcast Nordic daylight") and added warm, sunny presets (golden morning sunbeams, sunset glows).
- **Rule:** Appended a mandatory white balance instruction to all prompts: *«The white balance is strictly adjusted to warm, cozy tones, avoiding any cold, sterile, or blue cast lighting to maximize comfort (Gemütlichkeit).»*

### 4. Raw Wood Texturing (Preventing Plastic CGI Look)
- **Decision:** Replaced generic "wood" material references with desaturated, raw, tactile descriptions: *«solid wood with rich visible organic wood grain, tactile raw matte finish (unlackiertes Massivholz, komplett matt, keine Reflexionen)»*.

## [2026-09-14] E2E Test Suite & Production Audit

### 1. Playwright suites (`e2e/`)
- **Decision:** Added `ui` (every AI provider mocked, a guard fails the test on any unmocked request to Gemini/OpenRouter/Replicate/Blob/`/api`), `api` (route contracts and security checks) and `live` (free read-only key/model checks with `.env.local`).
- **Rule:** Local runs build the bundle with all provider env vars blanked (`playwright.config.ts`); prod runs use `playwright.prod.config.ts`. Tests must never print keys or session logs — compare secrets as booleans and keep `trace` off where responses carry them.

### 2. Intentionally failing tests
- **Decision:** 6 UI tests and 5 security tests fail on purpose; they pin real bugs and exposed credentials (listed under *Known Issues* in `CLAUDE.md`).
- **Rule:** Fix the app, not the assertion. Remove the Known Issues entry when its test turns green.

### 3. Production usage
- Images and video are generated only with Gemini models via the direct Gemini provider. OpenRouter and Qwen code paths are unused; their keys are being revoked.

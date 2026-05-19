# AI Agents Changelog & Architectural Decisions

This file tracks significant changes, architectural decisions, and logic updates implemented by AI agents (Gemini/Claude) in the `nana_banana` project. This helps maintain context across sessions and different agents.

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

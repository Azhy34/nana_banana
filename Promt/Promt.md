# PROMPT GENERATION INSTRUCTIONS: WALLPAPER IN INTERIOR (ETSY GERMANY 2026)

> **Source of truth:** these rules describe what the Batch generator actually sends. The code is
> `generateRandomTags()` and `buildGeminiPrompt()` in `services/promptGenerator.ts` and
> `generateCards()` in `hooks/useBatch.ts`. Change the code first, then this file.
> The Generator tab does not use this template — it sends the user's prompt plus reference-image instructions.

## RULE #1 — WALLPAPER MUST REMAIN UNCHANGED (CRITICAL)

The reference image is the product being sold. Every prompt opens by declaring its role:

> The provided reference image is a **single full-scale wall mural (not a repeating tileable pattern)**. It is mapped and
> stretched onto the feature wall **edge to edge**, as one continuous seamless mural without repeating, tiling, cuts or
> visible seams. The **bottom aligns with the floor/baseboard, the top reaches the ceiling**. Do not alter the colors,
> scale or design details. The wallpaper is the absolute visual hero of the image.

Lighting must graze the wall to create ambient occlusion and real shadows (so it reads as a physical wall, not a flat
overlay) while preserving the exact original colors.

## RULE #2 — RANDOM VARIABLE SELECTION

Per card, one value is picked at random from `trends.json` unless noted:

| Variable | Source | Notes |
|---|---|---|
| Color | `colors` | used as the decor accent color |
| Style | `styles` | |
| Furniture brand | `brands` | "[brand]-inspired" |
| Age group | `ageGroups` | assigned in a cycle across cards: baby → vorschul → schulkind → teenager |
| Key object | `keyObjects` filtered by age group | baby always gets `Classic slatted wooden baby crib` |
| Room zone | `roomZones` | |
| Lighting | `lighting` | |
| Camera angle / distance | `cameraAngles` / `cameraDistances` | |
| Depth of field | `depthOfField` | |
| Accessories | `accessories` | 2–3 items |
| Composition | code | 40% "unobstructed" (low furniture, wall fills the frame), 60% "natural" child-scale eye-level shot |
| Cinematic detail | `CINEMATIC_DETAILS` in code | one of 5 light effects |
| Camera body | code | one of 4 professional camera/lens descriptions |
| Market trends | `latestMarketInsights` | independent 50% chances to add a trending color accent, accessory and material |

Combinations are random; uniqueness within a batch is **not** enforced.

## RULE #3 — PROMPT STRUCTURE (5-LAYER ARCHITECTURE)

The prompt follows Google's best-practice 5-layer architecture for natural editorial interior photography:

1. **Wallpaper Mural Role (Layer 1):** Full-height 100% continuous mural coverage from baseboard to ceiling, running cleanly behind furniture, 1:1 color/scale fidelity.
2. **Natural Scene & Age Group Setting (Layer 2):** Authentic, lived-in Scandinavian children's bedroom tailored to the specific age group (no synthetic/luxury CGI buzzwords).
3. **Hero Furniture & Styling (Layer 3):** Brand-inspired key piece crafted from solid natural wood, age-appropriate lifestyle touches (e.g., wooden blocks, illustrated storybook, student notebooks), and subtle accent decor.
4. **Lighting & Physical Wallpaper Texture (Layer 4):** Directional window daylight grazing the wallpaper to highlight the tactile non-woven paper micro-relief (Craft Lambda sand grain) and casting soft physical ambient shadows.
5. **Camera & Optics (Layer 5):** 35mm lens, f/5.6 aperture, sharp mural focus, natural depth of field, warm cozy white balance.
6. **Conditional:** If a computer or monitor is in the scene, it is strictly turned off (matte dark screen with zero reflections).
7. **Negative Constraints:** Concise list avoiding peeling wallpaper, half-walls, house beds / roof frames, animal trophies, plastic, bunk beds, and clutter.

## RULE #4 — QUALITY & REALISM REQUIREMENTS

- **Materials:** Solid natural wood with visible organic grain (oak, birch, beech), washed linen, breathable organic cotton. Teenager rooms: natural wood with matte metal accents.
- **Banned:** Wicker, straw, and rattan (AI renders distorted woven artifacts), plastic furniture/toys, animal trophies/heads, bunk beds, ladders, house beds / house-frame beds (overhead roof frames and horizontal beams that cut across or obstruct the wallpaper mural).
- **Lived-in Realism (No "CGI Luxury"):** Avoid aspirational buzzwords (*flawless, masterpiece, luxury, Architectural Digest*) which trigger digital beauty filters. Use documentary interior photography descriptors.
- **Color & Light:** Warm, desaturated, sensory-friendly palette; directional natural window daylight.
- **Age Psychology:**
  - **Baby (0–3):** Peaceful nursery with slatted crib or Montessori floor bed, soft oat/cream tones, wooden mobile, zero sensory clutter.
  - **Preschool (3–6):** Playful yet calm room, child-scale play table, low toddler bed, wooden building blocks, picture books.
  - **School (6–10):** Balanced study and resting room, wooden student desk, ergonomic chair, tidy books, reading nook.
  - **Teenager (10–16):** Stylish youth bedroom with clean geometric lines, platform bed, modern desk with turned-off matte screen.

## RULE #5 — ASPECT RATIOS (BATCH)

| Format | Best for |
|---|---|
| 4:3 | Etsy main listing thumbnail (wider room context) |
| 2:3 | Vertical detail shots |
| 9:16 | Pinterest pins; the only format that can be sent to the Video tool |

Default distribution for 12 photos: 6× 9:16, 4× 2:3, 2× 4:3; other counts (6/9/15) are rescaled proportionally, and card order is shuffled.

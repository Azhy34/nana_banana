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
| Key object | `keyObjects` filtered by age group | baby always gets `Kinderbett mit Gitterstäben` |
| Room zone | `roomZones` | |
| Lighting | `lighting` | |
| Camera angle / distance | `cameraAngles` / `cameraDistances` | |
| Depth of field | `depthOfField` | |
| Accessories | `accessories` | 2–3 items |
| Composition | code | 40% "unobstructed" (low furniture, wall fills the frame), 60% "natural" child-scale waist-level shot |
| Cinematic detail | `CINEMATIC_DETAILS` in code | one of 5 light effects |
| Camera body | code | one of 4 professional camera/lens descriptions |
| Market trends | `latestMarketInsights` | independent 50% chances to add a trending color accent, accessory and material |

Combinations are random; uniqueness within a batch is **not** enforced.

## RULE #3 — PROMPT STRUCTURE

The prompt is one narrative text in English, in this order:

1. **Wallpaper role** — Rule #1.
2. **Editorial scene** — premium Architectural-Digest-style photo of a children's bedroom in `[STYLE]` (with description);
   Nachhaltigkeit, Gemütlichkeit, quiet sophistication; soft natural light on the matte paper texture and wood grain;
   no plastic, artificial light or clutter; **age-specific psychology paragraph** (see Rule #4).
3. **Hero furniture** — `[BRAND]`-inspired `[KEY_OBJECT]` in the age-appropriate material, on the German apartment floor
   with its ceiling height (`germanApartmentContext`), key object description, composition text.
4. **Styling** — natural materials, `[COLOR]` accents, `[ACCESSORIES]`, trend notes, authentic lifestyle touches;
   desaturated low-contrast palette; warm white balance (no cold/blue cast).
5. **Camera** — `[ANGLE]`, `[DISTANCE]`, `[DEPTH_OF_FIELD]` keeping the wall sharp, `[CINEMATIC_DETAIL]`.
6. **Lighting** — grazing light on the wallpaper, `[LIGHTING]` description, `Aspect ratio: [ASPECT_RATIO]`, camera body.
7. **Conditional** — if the text mentions a PC/monitor/screen/Schreibtisch, the screen is turned off (matte, no reflections).
8. **Negative list** — `Absolutely avoid: peeling wallpaper, corner/page curl, bed canopy, baldachin, curtains over the bed,
   foreground/hanging lights, objects blocking the wall, wicker/straw/rattan, bunk beds, ladders, plastic toys, clutter,
   text overlay, watermark, promotional text, watercolor patch …` (full list in code).

Text overlays (USP / promo brushstroke) are supported by `buildGeminiPrompt()` but **disabled**: `generateCards()` never sets `overlayText`.

## RULE #4 — QUALITY REQUIREMENTS

- **Materials:** solid wood with visible organic grain, raw matte finish (*unlackiertes Massivholz, komplett matt, keine
  Reflexionen*), linen, cotton, organic canvas. Teenager rooms: natural wood with matte metal and clean lines.
- **Banned:** wicker, straw and rattan (AI renders woven materials warped), plastic, bunk beds, ladders.
- **Shapes:** soft rounded edges (*Weiche Formen*) except for teenager rooms.
- **Color & light:** desaturated, low-contrast palette; warm cozy white balance.
- **Age psychology:**
  - baby (0–3): ultra-soft desaturated tones (oat, cream, faded sky blue), spacious and calming, no busy patterns;
  - vorschul (3–6): soft warm tones, simple uncluttered layout for play and rest;
  - schulkind (6–10): natural wood surfaces, organized layout for study and rest;
  - teenager (10–16): geometric lines, structured study/lounge zones.

## RULE #5 — ASPECT RATIOS (BATCH)

| Format | Best for |
|---|---|
| 4:3 | Etsy main listing thumbnail (wider room context) |
| 2:3 | Vertical detail shots |
| 9:16 | Pinterest pins; the only format that can be sent to the Video tool |

Default distribution for 12 photos: 6× 9:16, 4× 2:3, 2× 4:3; other counts (6/9/15) are rescaled proportionally, and card order is shuffled.

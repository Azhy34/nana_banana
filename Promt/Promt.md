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
| Color | `colors`, limited to the colours on the style's card | used as the decor accent color |
| Style | `styles` | each style is a card: signature words, suitable colours, what to avoid |
| Furniture brand | `brands` | "[brand]-inspired" |
| Age group | `ageGroups` | assigned in a cycle across cards: baby → vorschul → schulkind → teenager |
| Key object | `keyObjects` filtered by age group | baby always gets `Classic slatted wooden baby crib` |
| Room zone | `roomZones` | |
| Lighting | `lighting` | |
| Camera angle / distance | `cameraAngles` / `cameraDistances` | |
| Depth of field | `depthOfField` | |
| Accessories | `accessories` | 2–3 items |
| Composition | `staging` | the same for every card (Rule #7); the tag `compositionStrategy` is kept for old cards and changes nothing |
| Cinematic detail | `CINEMATIC_DETAILS` in code | one of 5 light effects |
| Camera body | code | one of 4 professional camera/lens descriptions |
| Market trends | `latestMarketInsights` (measured, every entry with its source) | independent 50% chances to add a trending color accent, accessory and material |

Combinations are random; uniqueness within a batch is **not** enforced.

## RULE #3 — PROMPT STRUCTURE (5-LAYER ARCHITECTURE)

The prompt follows Google's best-practice 5-layer architecture for natural editorial interior photography:

1. **Wallpaper Mural Role (Layer 1):** Full-height 100% continuous mural coverage from baseboard to ceiling, running cleanly behind furniture, 1:1 color/scale fidelity.
2. **Scene in the chosen style (Layer 2):** a children's bedroom "in <style> style"; the style's signature words come from its card in `trends.json` ("Styling: name (signature)"). The age group only sets the scale of the furniture and the toys, it never names a style (no synthetic/luxury CGI buzzwords).
3. **Hero Furniture & Styling (Layer 3):** Brand-inspired key piece crafted from solid natural wood, age-appropriate lifestyle touches (e.g., wooden blocks, illustrated storybook, student notebooks), and subtle accent decor.
4. **Lighting & Physical Wallpaper Texture (Layer 4):** Directional window daylight grazing the wallpaper to highlight the tactile non-woven paper micro-relief (Craft Lambda sand grain) and casting soft physical ambient shadows.
5. **Camera & Optics (Layer 5):** camera body, lens and aperture from the pools of `trends.json`, sharp mural focus, then the real-photograph line (`realism.photo`, positive wording).
6. **Conditional:** If a computer or monitor is in the scene, it is strictly turned off (matte dark screen with zero reflections).
7. **Negative Constraints:** the Avoid list is data (`negatives` in `trends.json`) plus what the chosen style's card says does not suit it.

## RULE #4 — QUALITY & REALISM REQUIREMENTS

- **Materials:** Solid natural wood with visible organic grain (oak, birch, beech), washed linen, breathable organic cotton. Teenager rooms: natural wood with matte metal accents.
- **Banned:** Wicker, straw, and rattan (AI renders distorted woven artifacts), plastic furniture/toys, animal trophies/heads, bunk beds, ladders, metal/iron spindle beds (beds strictly natural wood or fabric), ceiling downlights/recessed spotlights (cold office look), house beds / house-frame beds (overhead roof frames and horizontal beams that cut across or obstruct the wallpaper mural).
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

## RULE #6 — ONE SOURCE OF TRUTH FOR STYLES (owner rule 06.11)

The web app and the ComfyUI boards read **the same data** (`Promt/trends.json`: styles as cards, colours, accessories, materials, lighting,
camera pools, `realism`, `negatives`, the measured `latestMarketInsights` with sources) and build the prompt with **the same code**
(`services/promptGenerator.ts`: `buildGeminiPrompt` for the long prompt, `buildBriefPrompt` for the short one; ComfyUI calls both through
`scripts/build_batch_prompts.mjs`). No style, colour or camera is written into any other file of the prompt path; a test
(`comfy_nodes/test_trends_single_source.py`, run when the builder changes, not after data edits) fails if one is. To change a style, edit its card in `trends.json`. To refresh the trends,
research with Tavily/Exa, edit `trends.json` and put the source and date of every entry into `latestMarketInsights`.

## RULE #7 — THE MURAL IS THE HERO (owner rule 06.11, after the Listing 6 test)

A big mural in a crowded, frontal photo looks bad: the wall must be visible, the room spacious, the view slightly angled. In the prompt:
- **Camera as geometry, not mood:** `cameraAngles` are three concrete positions (far left corner / far right corner at about 30 degrees, middle of the long wall at about 20 degrees, pulled well back, the whole mural wall in perspective); distance only "wide shot" (ceiling strip above, skirting below, open floor in front); eye level only adult or tripod; no frontal, close-up, low-angle or child-eye-level views.
- **`staging` block:** room about 4.5 by 3.5 m under 2.8 m, camera about 4 m from the wall, one hero piece below 90 cm along a side wall, at most two small accessories, nothing taller than the lower third of the mural. Positive wording and numbers.
- **No random clutter:** the builder reads one low toy per age group, no random decor; key objects with `muralSafe: false` (tent nook, table with chairs) are never picked at random; accessories 1-2.
- **Negatives are the last guard** (`negatives.base`: wardrobe or tall furniture against the mural wall, table and chairs in the foreground, crowded room, straight-on frontal view, furniture hiding the lower part of the mural). The KIE models have no negative field and Google advises positive wording, so the real work is done by removing the causes (what we ask for) and by the staging words above.
- The director rejects a kit whose scene has a wardrobe, a tent or a table with chairs.


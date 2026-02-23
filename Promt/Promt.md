# PROMPT GENERATION INSTRUCTIONS: WALLPAPER IN INTERIOR (ETSY GERMANY 2026)

## RULE #1 — WALLPAPER MUST REMAIN UNCHANGED (CRITICAL)

The provided reference image is the product being sold. Declare its role explicitly at the start of every prompt:

> **"Reference image role: this is the wallpaper pattern. Seamlessly apply it to the entire feature wall, draping it onto the surface while preserving its natural lighting and texture. Do not alter the pattern, colors, scale, or any design detail."**

Additional constraints:
- Do NOT recolor, rescale, simplify, or stylize the pattern
- Do NOT adapt it to match the room color palette
- Do NOT blur, soften, or reduce detail
- The wall must be flat, seamless, filling the **entire visible surface** with no seams, edges, or joins
- If in doubt — keep the wallpaper pattern **exactly as provided**

## RULE #2 — RANDOM VARIABLE SELECTION ALGORITHM

For every new image, randomly pick **one value** from each category in `trends.json`:

| Variable        | Source key in trends.json |
|----------------|---------------------------|
| Color           | `colors`                  |
| Style           | `styles`                  |
| Furniture brand | `brands`                  |
| Age group       | `ageGroups`               |
| Key object      | `keyObjects`              |
| Room zone       | `roomZones`               |
| Lighting        | `lighting`                |
| Camera angle    | `cameraAngles`            |
| Camera distance | `cameraDistances`         |
| Accessories     | pick **2–3** from `accessories` |

Each generation must produce a **unique combination**. Never repeat the same color + style + brand combination twice in a batch.

## RULE #3 — FINAL PROMPT TEMPLATE

Use this exact structure when building the Gemini prompt:

```
Reference image role: this is the wallpaper pattern. Seamlessly apply it to the entire
feature wall, draping it onto the surface while preserving its natural lighting and texture.
Do not alter the pattern, colors, scale, or any design detail.

Professional interior photography, 8K, photorealistic.
Children's [AGE_GROUP] bedroom, [ROOM_ZONE] focus.
Style: [STYLE].

Subject: [BRAND]-inspired [KEY_OBJECT] in solid [MATERIAL], soft rounded edges (Weiche Formen).
Location: children's bedroom, light oak parquet floor, approx. 12 m², 2.7 m high ceiling.
Action: a beautifully styled, calm and organized room scene.
Room accent color: [COLOR]. Natural materials visible: solid wood, rattan, jute, linen, cotton.
Accessories: [ACCESSORIES].

Camera: [ANGLE], [DISTANCE], [DEPTH_OF_FIELD].
Lighting: [LIGHTING].
Color grading: warm natural tones, soft contrast.
Aspect ratio: [ASPECT_RATIO].

Atmosphere: Nachhaltigkeit (eco-friendly), Gemütlichkeit (coziness), Multifunktionalität.

Negative prompt: no beige monotony, no cold grey tones, no plastic toys,
no sharp furniture corners, no visual noise, no chaos boho, no gallery walls.
```

## RULE #4 — QUALITY REQUIREMENTS

- Always mention visible natural textures: solid birch / oak / beech, linen, rattan, jute
- Shapes: rounded edges everywhere — no sharp corners on any furniture
- Atmosphere must reflect German values: eco-friendly materials, cozy warmth, smart storage
- Photography style: professional interior shoot, soft natural light, no harsh shadows

## RULE #5 — ASPECT RATIO GUIDANCE

| Format | Best for                          |
|--------|-----------------------------------|
| 9:16   | Mobile browsing, portrait room shots |
| 16:9   | Wide room views, lifestyle context   |
| 1:1    | Etsy main listing thumbnail          |

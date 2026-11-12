#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

function getApiKey() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/) ||
                  content.match(/VITE_GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
    if (match) return match[1].trim();
  }
  return process.env.GEMINI_API_KEY || null;
}

const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 44';
const ART_DIR = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';
const REF_WALLPAPER = path.join(ART_DIR, 'clean_l44_wallpaper_ref.png');
const REF_TEXTURE = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');

const PROMPTS = [
  {
    id: 'opt1_craft_table',
    title: 'Option 1: Flower Craft Table, Bunny Chairs & Donut Poufs (Clean Fun Haus Interior)',
    filename: 'l44_opt1_craft_table_bunny_chairs_9x16.png',
    prompt: [
      "WALLPAPER SPECIFICATION (STRICT 1:1 REPLICATION): REFERENCE_IMAGE_1 is the exact wallpaper mural pattern. FULL-HEIGHT 100% WALL COVERAGE: Map this reference image across the entire feature wall from the floor baseboard up to the ceiling line edge-to-edge behind the furniture without any horizontal cut, extra molding, or wainscoting.",
      "The wallpaper design consists strictly of two sections printed on the paper: the lower half is a light powder blue and soft cream gingham/vichy check pattern; in the center is a continuous dark burgundy scalloped wave border; the upper half is a soft warm cream background with scattered small dark burgundy stars.",
      "FACTORY ACCURACY LOCK: The small burgundy stars are strictly located on the upper cream section. Absolutely ZERO stars on the lower blue check section. Retain the exact proportions, colors, check grid size, and star density 1:1.",
      "ROOM & INTERIOR STYLE: An authentic, joyful, bright Scandinavian children's playroom designed in the trending Fun Haus / Dopamine Decor / Retro Kids aesthetic. Warm, playful, and beautifully balanced.",
      "HERO FURNITURE & PLAY ZONE: The focal point is a charming flower-shaped children's craft table crafted from smooth pale birch wood with soft organic rounded petals. Accompanying the table are two matching wooden chairs with whimsical bunny-ear backrests, and a low stack of two circular donut/macaron foam poufs in warm ochre yellow and muted terracotta. On the table rests a solid wooden pencil cup holding colorful wax crayons, open drawing paper with gentle pastel doodles, and a few smooth wooden building blocks.",
      "STYLING & FLOOR: Light natural matte oak parquet floor with a soft textured cream circular dot rug. On the left wall, a minimalist curved birch toy shelf with neatly displayed wooden toys. Warm cozy atmosphere, zero visual clutter.",
      "LIGHTING & TEXTURE: Directional warm morning sunlight streams from an adjacent window at an angle, gently grazing the wallpaper surface to reveal the ultra-matte non-woven paper texture (Craft Lambda fine sand grain micro-relief matching REFERENCE_IMAGE_2) and casting crisp, soft, grounding ambient shadows under the table legs and chairs.",
      "CAMERA & COMPOSITION: Vertical 9:16 composition composed at a child-height eye-level perspective (approx. 90cm from floor). Shot on Sony A7R V, 35mm prime lens, f/5.6 aperture, sharp mural focus across the entire wall, natural optical depth. 100% clean frame, zero watermarks, zero text overlays.",
      "Avoid: peeling wallpaper, half-wall wallpaper, split wall, wainscoting, wall paneling, stars on the blue checkered pattern, stars below the scalloped border, stars on the lower wall, distorted checkered pattern, warped grid, house bed, house frame, bunk bed, plastic toys, messy room, CGI 3D render look, flat soap textures, blurry textures, ceiling spotlights, fluorescent light, people, child, baby, human figures."
    ].join(" ")
  },
  {
    id: 'opt2_baby_playing',
    title: 'Option 2: Baby Playing with Wooden Blocks on Quilted Rug (Corrected Wallpaper Lock)',
    filename: 'l44_opt2_baby_playing_rug_9x16.png',
    prompt: [
      "WALLPAPER SPECIFICATION (STRICT 1:1 FACTORY ACCURACY): REFERENCE_IMAGE_1 is the exact wallpaper mural pattern. FULL-HEIGHT 100% WALL COVERAGE: Map this reference image across the feature wall edge-to-edge from the floor baseboard up to the ceiling line.",
      "The authentic wallpaper consists of: a lower section of light powder blue and cream vichy gingham check, a middle scalloped wave border in deep burgundy red, and an upper section of soft warm cream background with small scattered burgundy stars.",
      "STRICT PATTERN SEPARATION LOCK: The burgundy stars exist ONLY on the upper cream section. Absolutely ZERO stars on the blue and cream checkered pattern. Zero rogue stars, zero stars below the scalloped line. Retain the exact proportions, check size, and colors 1:1.",
      "INTERIOR SCENE & LIFESTYLE: A peaceful, warm, biophilic nursery corner in Fun Haus / Retro Kids style. An adorable 10-month-old baby in a simple, neutral oatmeal linen romper is sitting calmly on a round cream quilted cotton floor play mat, playing with smooth natural wooden building blocks.",
      "FURNITURE & ACCENTS: In the background against the wall, a low fluted natural birch storage bench or low wooden shelf with a couple of carved wooden animal toys. A woven wicker pendant lamp hangs gently from above casting a warm glow. Light matte oak parquet flooring with warm natural grain.",
      "LIGHTING & PAPER TEXTURE: Warm golden morning sunlight filters gently into the room, grazing across the wall to reveal the physical matte non-woven paper micro-relief (Craft Lambda sand grain texture matching REFERENCE_IMAGE_2) and casting authentic soft shadows. Wholesome, gentle, heartwarming commercial lifestyle photography.",
      "CAMERA & OPTICS: Vertical 9:16 medium shot composed at low child-height eye level (approx. 60-70cm from floor). Shot on Hasselblad H6D-100c, 45mm lens, f/5.6 aperture, sharp wallpaper focus, natural depth of field. 100% clean frame, zero text, zero watermark.",
      "Avoid: stars on the blue checkered pattern, stars below the scalloped border, stars on the lower half of the wall, rogue star on tiles, extra limbs, deformed fingers, warped face, distorted baby anatomy, plastic toys, wainscoting, split wall, peeling wallpaper, ceiling spotlights, CGI look, blurry textures."
    ].join(" ")
  }
];

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found');

  const ai = new GoogleGenAI({ apiKey });

  console.log('='.repeat(75));
  console.log('🎨 GENERATING LISTING 44 TWO PHOTO OPTIONS (9:16 2K)');
  console.log(`Wallpaper Ref: ${REF_WALLPAPER}`);
  console.log(`Texture Ref:   ${REF_TEXTURE}`);
  console.log(`Destination:   ${OUT_DIR}`);
  console.log('='.repeat(75));

  if (!fs.existsSync(REF_WALLPAPER)) throw new Error('Ref wallpaper not found');
  if (!fs.existsSync(REF_TEXTURE)) throw new Error('Ref texture not found');

  const wallpaperBuf = fs.readFileSync(REF_WALLPAPER);
  const textureBuf = fs.readFileSync(REF_TEXTURE);

  for (const opt of PROMPTS) {
    console.log(`\n📸 Generating ${opt.title}...`);
    const start = Date.now();

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `REFERENCE_IMAGE_1: Wallpaper mural reference image. Match the pattern, colors, stars, and gingham check 1:1.\nREFERENCE_IMAGE_2: Physical Craft Lambda paper texture reference image.` },
            {
              inlineData: {
                data: wallpaperBuf.toString('base64'),
                mimeType: 'image/png'
              }
            },
            {
              inlineData: {
                data: textureBuf.toString('base64'),
                mimeType: 'image/jpeg'
              }
            },
            { text: opt.prompt }
          ]
        }
      ],
      config: {
        outputMimeType: 'image/png',
        imageGenerationConfig: {
          aspectRatio: '9:16',
          resolution: '2K'
        }
      }
    });

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`✓ Completed in ${elapsed}s`);

    let imageBase64 = null;
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error('Response candidate:', JSON.stringify(candidate));
      throw new Error(`Failed to extract image data for ${opt.id}`);
    }

    const outPath = path.join(OUT_DIR, opt.filename);
    const artPath = path.join(ART_DIR, opt.filename);
    const buf = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(outPath, buf);
    fs.writeFileSync(artPath, buf);
    console.log(`✓ Saved: ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`✓ Copied to artifact: ${artPath}`);
  }

  console.log('\n🎉 ALL 2 OPTIONS GENERATED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});


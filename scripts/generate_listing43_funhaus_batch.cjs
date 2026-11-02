#!/usr/bin/env node

/**
 * Batch Generator for Listing 43:
 * Style: Fun Haus / Playful Interior / Dopamine Decor / Retro Kids
 * Reference Wallpaper: streifentapete-altrosa-creme-muster-vliestapete-3x2.png
 * Destination: C:\Users\Mikhail\Desktop\Обои\Листинг 43\Fun Haus  Playful Interior  Dopamine Decor  Retro Kid
 *
 * Matrix: 9 images
 * - 3x 4:3 (Etsy Main Listings)
 * - 3x 2:3 (Etsy Mobile / Pinterest Vertical Lifestyles)
 * - 3x 9:16 (Full-screen Clean Video Base for Kling 2.6 + HyperFrames)
 *
 * Wall Distribution (50/50):
 * - Variant A (Full-Height 100% Wall Coverage)
 * - Variant B (Playful Scalloped Border Wave Trim)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function logSession(event) {
  const file = path.join(process.cwd(), 'gemini_sessions.json');
  let data = {};
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch {}
  }
  const sid = event.sessionId || 'listing-43-funhaus';
  if (!data[sid]) data[sid] = { createdTime: new Date().toISOString(), events: [] };
  data[sid].events.push(event);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const WALLPAPER_PATH = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/streifentapete-altrosa-creme-muster-vliestapete-3x2.png';
const TEXTURE_PATH = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';

const BATCH_SPECS = [
  // --- 4:3 Horizontal Listings ---
  {
    id: 'card_01_4x3_fullwall_playroom',
    aspectRatio: '4:3',
    variant: 'Variant A (Full Height)',
    filename: 'funhaus_01_4x3_fullwall_playroom.png',
    prompt: [
      "WALLPAPER SPECIFICATION: The reference image is a vertical stripe wallpaper mural in dusty rose and warm cream (Altrosa und Creme). FULL-HEIGHT 100% WALL COVERAGE: This exact wallpaper pattern must be applied across the entire feature wall from the floor baseboard all the way up to the ceiling, completely seamless, edge-to-edge, running solidly behind all furniture without any cut, split, or unpapered section. Retain the exact stripe widths, colors, and proportions 1:1.",
      "ROOM & INTERIOR STYLE: An authentic, bright, cheerful children's bedroom designed in the trending Fun Haus / Playful Interior / Dopamine Decor aesthetic. The room radiates joyful, creative energy with clean Scandinavian craftsmanship.",
      "HERO FURNITURE & PLAYFUL OBJECTS: A low natural birch toddler daybed dressed in crisp organic cotton bedding with striped and checkered bolster pillows. Next to it, an adorable flower-shaped craft table in pale lacquered wood, accompanied by a stack of circular donut/macaron foam poufs in soft poppy red, ochre yellow, and muted sage. A whimsical mid-century cobalt blue mushroom table lamp rests on a fluted birch nightstand.",
      "DOPAMINE ACCENTS & DECOR: Wavy scalloped picture frames with colorful retro graphic art prints hang neatly on the wall. A playful cluster bubble chandelier with frosted glass globes hangs from the high ceiling. Light natural oak hardwood parquet floor under soft ambient daylight.",
      "LIGHTING & TEXTURE: Grazing natural morning daylight streams from an adjacent window, highlighting the tactile ultra-matte non-woven paper texture (Craft Lambda fine sand grain micro-relief) and casting gentle ambient shadows. Shot on Sony A7R V, 35mm prime lens, f/5.6 aperture, edge-to-edge mural sharpness."
    ].join(" ")
  },
  {
    id: 'card_02_4x3_scallop_retro_bedroom',
    aspectRatio: '4:3',
    variant: 'Variant B (Scalloped Border Trim)',
    filename: 'funhaus_02_4x3_scallop_border_retro_bedroom.png',
    prompt: [
      "WALLPAPER SPECIFICATION: The reference image provides the vertical stripe wallpaper pattern in dusty rose and warm cream (Altrosa und Creme). Retain the exact stripe widths, colors, and soft tactile texture 1:1.",
      "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The feature wall features a playful retro two-tone layout inspired by European dopamine decor: the dusty rose striped wallpaper covers the lower two-thirds of the wall, crowned by a distinct decorative red lacquer scalloped wave border trim (festooned wavy moulding). Above the scalloped trim, the upper wall is painted in warm chalky cream with a gallery of charming retro illustrations in scalloped and checkered frames.",
      "HERO FURNITURE: A vintage-inspired curved metal spindle bed in pale cornflower blue with soft textured waffle blankets and gingham cushions. A low birch modular bookcase with open compartments displays wooden toys and colorful books. Light oak wood flooring with a plush cream textured dot rug.",
      "STYLING & ATMOSPHERE: Fun Haus retro kids styling with tasteful dopamine color pops (terracotta, cobalt blue, sunny mustard). Clean, joyful, stylish, high-end editorial look.",
      "LIGHTING & OPTICS: Warm directional window daylight grazes the textured wallpaper surface. Shot on Canon EOS R5, 35mm prime lens, f/5.6, crisp architectural framing, natural optical depth."
    ].join(" ")
  },
  {
    id: 'card_03_4x3_fullwall_cozy_nook',
    aspectRatio: '4:3',
    variant: 'Variant A (Full Height)',
    filename: 'funhaus_03_4x3_fullwall_cozy_nook.png',
    prompt: [
      "WALLPAPER SPECIFICATION: The reference image is a vertical stripe wallpaper mural in dusty rose and warm cream (Altrosa und Creme). FULL-HEIGHT 100% WALL COVERAGE: Map this reference image across 100% of the accent wall from the floor baseboard to the ceiling without any horizontal split or wainscoting. Exact 1:1 color fidelity and scale.",
      "ROOM & INTERIOR STYLE: A delightful, spacious Scandinavian playroom and reading sanctuary in Dopamine Decor / Retro Kids style. Playful, warm, and inviting.",
      "FURNITURE & DETAILS: A minimalist low solid birch floor bed with soft organic linen cushions. In the corner, a whimsical reading tent/teepee with a felt ball garland. A low round wooden play table with two bunny-ear wooden chairs and smooth sensory wooden building blocks catching the sun.",
      "DECOR & LIGHTING: Scalloped wall shelves displaying children's books, a soft mustard yellow throw blanket, and a fluffy wool rug. Warm diffused morning light floods the interior through tall windows, grazing the tactile matte non-woven fleece paper micro-relief. Hasselblad H6D-100c, 45mm lens, f/8.0 aperture."
    ].join(" ")
  },

  // --- 2:3 Vertical Lifestyle Shots ---
  {
    id: 'card_04_2x3_scallop_art_desk',
    aspectRatio: '2:3',
    variant: 'Variant B (Scalloped Border Trim)',
    filename: 'funhaus_04_2x3_scallop_craft_table_lifestyle.png',
    prompt: [
      "WALLPAPER SPECIFICATION: The reference image is a vertical stripe wallpaper in dusty rose and cream (Altrosa und Creme). The wallpaper covers the wall up to an eye-catching decorative scalloped wave trim in warm poppy red. Above the wavy trim, warm cream wall with cute scalloped frames.",
      "COMPOSITION (VERTICAL 2:3 LIFESTYLE): Focused medium shot on a charming child's creative workspace. An organic flower-shaped craft table in pale birch wood with wooden pots holding colored pencils and open drawing paper. Beside the desk, two stackable foam doughnut poufs in mustard yellow and strawberry pink.",
      "DETAILS & ATMOSPHERE: Bunting triangle flag garland in muted pastel tones hangs gracefully above. Light oak herringbone floor. Warm golden morning sunlight streaming from the side, casting soft geometric shadows on the textured wallpaper. Shot on Fujifilm GFX 100S, 45mm medium format lens, f/4.0 aperture, delicate background falloff."
    ].join(" ")
  },
  {
    id: 'card_05_2x3_fullwall_bedside',
    aspectRatio: '2:3',
    variant: 'Variant A (Full Height)',
    filename: 'funhaus_05_2x3_fullwall_bedside_reading.png',
    prompt: [
      "WALLPAPER SPECIFICATION: FULL-HEIGHT 100% WALL COVERAGE: The dusty rose and warm cream vertical stripe wallpaper covers 100% of the wall surface from the floor baseboards to the high ceiling without horizontal breaks. Retain pattern and colors 1:1.",
      "COMPOSITION (VERTICAL 2:3 INTERIOR): A cozy, intimate bedside vignette. A low Scandinavian toddler bed in light natural birch with soft cotton duvet and a cylindrical bolster pillow in gingham check. A small cylindrical pedestal bedside table with a cobalt blue retro mushroom lamp.",
      "LIFESTYLE & MATERIALS: A stack of illustrated storybooks on the floor, a fluffy cream wool bouclé pouf, and a soft morning sunbeam grazing across the tactile wallpaper texture, revealing the Craft Lambda fine sand grain micro-relief. Sony A7R V, 50mm normal lens, f/5.6 aperture."
    ].join(" ")
  },
  {
    id: 'card_06_2x3_scallop_daybed',
    aspectRatio: '2:3',
    variant: 'Variant B (Scalloped Border Trim)',
    filename: 'funhaus_06_2x3_scallop_daybed_vignette.png',
    prompt: [
      "WALLPAPER SPECIFICATION: Dusty rose and cream vertical stripe wallpaper (Altrosa und Creme). WALL DESIGN: The striped wallpaper is framed with a playful scalloped wave border trim along the upper third of the wall, creating a nostalgic retro kids aesthetic.",
      "FURNITURE & STYLING: A curved scalloped upholstered daybed in warm cream bouclé fabric with decorative cushions in red lacquer accents and soft sage green. Next to the bed, a quirky spindle side table with a spherical glass lamp. Floating scalloped wall shelf with small wooden animal toys.",
      "LIGHTING & MOOD: Soft natural daylight grazing the matte non-woven wallpaper substrate. Canon EOS R5, 45mm lens, f/5.6 aperture, authentic ambient depth."
    ].join(" ")
  },

  // --- 9:16 Vertical Video Base (CLEAN, NO TEXT, DEEP PERSPECTIVE) ---
  {
    id: 'card_07_9x16_fullwall_video_base',
    aspectRatio: '9:16',
    variant: 'Variant A (Full Height - Video Ready)',
    filename: 'funhaus_07_9x16_fullwall_video_master.png',
    prompt: [
      "WALLPAPER SPECIFICATION: FULL-HEIGHT 100% WALL COVERAGE: This entire vertical frame is anchored by a feature wall covered edge-to-edge and floor-to-ceiling with the reference dusty rose and warm cream vertical striped wallpaper (Altrosa und Creme). Completely seamless, running solidly behind all furniture without any cut, split, or unpapered section. 1:1 pattern fidelity.",
      "ROOM ARCHITECTURE & DEPTH (OPTIMIZED FOR VIDEO MOTION): Wide, spacious, unobstructed vertical composition composed from a child's eye-level perspective looking towards the feature wall. A low solid birch floor bed positioned low in the frame keeps the wallpaper mural expansive and hero of the shot. Light oak floor with an organic wavy cream rug.",
      "FURNITURE & LOCKS: Solid natural wood furniture, low profile, clean lines, no tall obstructing beams, no clutter. In the corner, a neat stack of colorful donut poufs (mustard, rose, sage). Warm morning sunlight floods from a side window, grazing softly across the wallpaper texture. ZERO text, zero watermark, crystal sharp 2K resolution."
    ].join(" ")
  },
  {
    id: 'card_08_9x16_scallop_video_base',
    aspectRatio: '9:16',
    variant: 'Variant B (Scalloped Border Trim - Video Ready)',
    filename: 'funhaus_08_9x16_scallop_border_video_master.png',
    prompt: [
      "WALLPAPER SPECIFICATION: Vertical stripe wallpaper in dusty rose and cream (Altrosa und Creme) covering the lower two-thirds of the wall, crowned by a distinct red scalloped wave border trim. Upper wall is warm cream with retro art in wavy frames.",
      "ROOM ARCHITECTURE (OPTIMIZED FOR VIDEO MOTION): A balanced, cinematic vertical interior shot. A vintage metal daybed in soft pastel blue with checked cushions to one side, a charming flower-shaped low wooden craft table with neat wooden crayons in the midground. Deep floor perspective on oak parquet.",
      "LIGHTING & PURITY: Directional morning sunlight cuts through the room, creating authentic soft shadows. The wallpaper is illuminated with rich tactile micro-relief. ZERO text, zero overlays, pristine 2K clarity ready for smooth camera flight."
    ].join(" ")
  },
  {
    id: 'card_09_9x16_fullwall_sanctuary',
    aspectRatio: '9:16',
    variant: 'Variant A (Full Height - Video Ready)',
    filename: 'funhaus_09_9x16_fullwall_playful_sanctuary.png',
    prompt: [
      "WALLPAPER SPECIFICATION: FULL-HEIGHT 100% WALL COVERAGE: The entire background wall is covered from floor baseboard to the ceiling with the dusty rose and cream vertical striped wallpaper (Altrosa und Creme). The stripes are crisp, authentic, and perfectly aligned 1:1 with the reference.",
      "PLAYFUL DOPAMINE INTERIOR: A low birch storage console with colorful canvas storage boxes (mustard yellow, terracotta, and soft sky blue). A cozy reading nook with a plush floor cushion and neatly stacked storybooks. Beautiful floating wooden shelves catching sunlight.",
      "LIGHTING & OPTICS: Warm natural daylight streaming across the wall, highlighting the physical Craft Lambda non-woven paper micro-relief. Photographed on Sony A7R V, 35mm lens, f/5.6 aperture. Pure clean image without any text or logos, ready for video animation."
    ].join(" ")
  }
];

const BASE_NEGATIVE = "peeling wallpaper, wallpaper peeling off wall, corner curl, bed canopy, fabric canopy, baldachin, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, fake taxidermy, animal trophies, wicker baskets, straw baskets, rattan furniture, plastic furniture, plastic toys, bunk beds, ladders, messy clutter, distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words";

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  if (!fs.existsSync(WALLPAPER_PATH)) {
    console.error('❌ Wallpaper reference file not found:', WALLPAPER_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('='.repeat(75));
  console.log('🎨 BATCH GENERATION: LISTING 43 (Fun Haus / Dopamine Decor / Retro Kids)');
  console.log(`Wallpaper: ${path.basename(WALLPAPER_PATH)}`);
  console.log(`Texture:   Craft Lambda Sand Micro-relief`);
  console.log(`Output:    ${OUT_DIR}`);
  console.log(`Total:     9 Cards (3x 4:3, 3x 2:3, 3x 9:16)`);
  console.log('='.repeat(75));

  // Load wallpaper base64
  const wallpaperBuf = fs.readFileSync(WALLPAPER_PATH);
  const wallpaperBase64 = wallpaperBuf.toString('base64');
  const wallpaperPart = {
    inlineData: {
      data: wallpaperBase64,
      mimeType: 'image/png'
    }
  };

  // Load texture base64 if present
  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = {
      inlineData: {
        data: texBuf.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };
    console.log('✓ Craft Lambda texture loaded');
  }

  const ai = new GoogleGenAI({ apiKey });

  for (let i = 0; i < BATCH_SPECS.length; i++) {
    const spec = BATCH_SPECS[i];
    const outPath = path.join(OUT_DIR, spec.filename);

    console.log(`\n[${i+1}/9] Generating ${spec.id} (${spec.aspectRatio} | ${spec.variant})...`);

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100000) {
      console.log(`⏭️ File already exists, skipping: ${spec.filename}`);
      continue;
    }

    const parts = [
      { text: "REFERENCE_IMAGE_1 (Wallpaper Graphic Design): This is the exact wallpaper graphic design to display on the feature wall. Preserve all vertical stripe lines, dusty rose (Altrosa) and cream colors, and proportions 1:1 without alteration or recoloring." },
      wallpaperPart
    ];

    if (texturePart) {
      parts.push({
        text: "REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a macro photograph of the physical wallpaper material. Extract and apply ONLY the physical surface micro-relief: the fine-grain sand texture, non-woven fleece paper substrate, and ultra-matte finish under daylight. DO NOT copy any drawings or gold leaf from this reference."
      });
      parts.push(texturePart);
    }

    parts.push({ text: spec.prompt });

    const startTime = Date.now();
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: spec.aspectRatio,
              imageSize: "2K",
              negativePrompt: BASE_NEGATIVE
            }
          }
        });

        const candidates = response.candidates || [];
        let saved = false;

        for (const candidate of candidates) {
          const resParts = candidate.content?.parts || [];
          for (const p of resParts) {
            if (p.inlineData && p.inlineData.data) {
              const imgBuf = Buffer.from(p.inlineData.data, 'base64');
              fs.writeFileSync(outPath, imgBuf);
              const duration = ((Date.now() - startTime) / 1000).toFixed(1);
              const sizeMb = (imgBuf.length / 1024 / 1024).toFixed(2);
              console.log(`✓ Saved ${spec.filename} (${sizeMb} MB) in ${duration}s`);
              saved = true;

              // Log session
              logSession({
                timestamp: new Date().toISOString(),
                sessionId: 'listing-43-funhaus',
                model: 'gemini-3.1-flash-image',
                prompt: spec.prompt.slice(0, 300) + '...',
                cost: 0.0672,
                duration: parseFloat(duration),
                status: 'success',
                resolution: '2K',
                aspectRatio: spec.aspectRatio,
                outputFile: outPath
              });

              break;
            }
          }
          if (saved) break;
        }

        if (!saved) throw new Error("No inline image data in Gemini response");
        success = true;

      } catch (err) {
        console.warn(`⚠️ Attempt ${attempts} failed: ${err.message}`);
        if (attempts < 3) {
          console.log('Waiting 5s before retry...');
          await new Promise(r => setTimeout(r, 5000));
        } else {
          console.error(`❌ Failed to generate ${spec.filename} after 3 attempts`);
        }
      }
    }

    // Gentle 3s pause between cards to avoid rate limits
    if (i < BATCH_SPECS.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n🎉 All 9 cards processed successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});


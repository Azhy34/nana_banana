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

const WALLPAPER_PATH = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/streifentapete-salbeigruen-creme-muster-vliestapete-3x2.png';
const TEXTURE_PATH = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const ART_DIR = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const STRICT_WALLPAPER_L40 = [
  "ABSOLUTE 1:1 PATTERN REPRODUCTION (CRITICAL): The wallpaper mural on the wall MUST replicate REFERENCE_IMAGE_1 with 100% geometric and color fidelity.",
  "Look closely at REFERENCE_IMAGE_1: the wallpaper consists ONLY of alternating equal-width stripes in soft cream (ivory) and muted earthy sage green (Salbeigrün).",
  "There are NO pinstripes, NO lines inside the stripes, and NO lines on the edges of the stripes.",
  "The boundary between the cream stripe and sage green stripe is completely flat, seamless, and devoid of any dark outlines, black borders, or shadows.",
  "STRICT NEGATIVE INSTRUCTION: DO NOT add black lines, DO NOT add black outlines, DO NOT add pinstripes, DO NOT render 3D wood slats, grooves, or beadboard shadows. It is purely flat 2D wallpaper printed on smooth matte non-woven paper."
].join(" ");

const CARDS = [
  {
    id: 'l40_card_01_9x16_scallop_wooden_bed',
    filename: 'l40_funhaus_01_9x16_scallop_wooden_bed.png',
    title: 'Card 1: Scallop Trim + Natural Birch Wooden Toddler Bed (Reel 1 Scene 1)',
    prompt: [
      STRICT_WALLPAPER_L40,
      "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The feature wall features a playful retro two-tone layout: the sage green and cream striped wallpaper covers the lower two-thirds of the wall, crowned by a distinct decorative terracotta/coral red lacquer scalloped wave border trim (festooned wavy moulding). Above the scalloped trim, the upper wall is painted in warm chalky cream with retro art prints in scalloped wooden and checkered frames.",
      "HERO FURNITURE (NO METAL BED - NATURAL SOLID WOOD ONLY): A low Scandinavian toddler bed crafted in smooth natural solid birch wood with rounded safety rails (NOT metal, completely solid wood). Dressed in crisp cream organic cotton bedding with an ochre yellow waffle throw and a sage-and-white gingham cushion.",
      "ROOM DETAILS & DOPAMINE ACCENTS: An adorable low flower-shaped wooden craft table with neat wax crayons. A stack of circular donut/macaron foam poufs (soft terracotta, mustard yellow, muted mint). A whimsical cobalt blue mushroom table lamp on a low fluted wood nightstand. Frosted bubble globe chandelier hanging from the high ceiling. Light oak herringbone floor.",
      "LIGHTING & OPTICS: Warm directional morning window light softly grazing across the textured wallpaper surface, revealing Craft Lambda non-woven paper micro-relief. Pure clean image, zero text, zero watermarks, 100% clean video-ready base."
    ].join(" ")
  },
  {
    id: 'l40_card_02_9x16_scallop_play_table_lifestyle',
    filename: 'l40_funhaus_02_9x16_scallop_play_table_lifestyle.png',
    title: 'Card 2: Scallop Trim + Creative Play Corner & Donut Poufs (Reel 1 Scene 2)',
    prompt: [
      STRICT_WALLPAPER_L40,
      "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The lower section of the wall features the sage green and cream striped wallpaper, topped with the decorative red/terracotta scalloped wave moulding. Warm cream wall above with a gallery of cute retro children's illustrations (smiling apple, little bear).",
      "COMPOSITION (VERTICAL 9:16 PLAY CORNER FOCUS): Focused medium shot on the child's creative craft space. An organic flower-shaped low table in light natural wood with colorful wooden pencils, open sketchbook, and smooth tactile wooden building blocks. Beside the table, stackable circular macaron/donut foam poufs in poppy red and ochre.",
      "FURNITURE & LIFESTYLE: A low birch storage shelf displaying wooden toy animals and colorful children's books. A soft woven dotted rug on light oak parquet flooring. Warm sunbeam streaming across the matte wallpaper texture. Zero text, zero watermarks, 100% clean video-ready base."
    ].join(" ")
  },
  {
    id: 'l40_card_03_9x16_fullwall_daybed_bubble_lamp',
    filename: 'l40_funhaus_03_9x16_fullwall_daybed_bubble_lamp.png',
    title: 'Card 3: 100% Full Wall Mural + Scandinavian Birch Daybed (Reel 2 Scene 1)',
    prompt: [
      STRICT_WALLPAPER_L40,
      "FULL-HEIGHT 100% WALL COVERAGE: It is strictly mandatory that this exact sage green and cream striped wallpaper covers 100% of the entire accent wall from floor baseboard to the high ceiling, completely seamless, edge-to-edge behind all furniture without any horizontal split, cut, or paneling.",
      "HERO FURNITURE (NO METAL BED - NATURAL SOLID BIRCH ONLY): A low Scandinavian daybed in smooth natural birch wood, styled with soft linen bedding, a striped cylindrical bolster pillow, and a warm mustard yellow gingham cushion. Beside it, a cylindrical fluted birch nightstand with a retro cobalt blue mushroom table lamp.",
      "ROOM ACCENTS: Scalloped wooden picture frames with joyful retro graphic art prints hang neatly on the striped feature wall. Cluster frosted glass bubble chandelier hanging at the ceiling. Light oak herringbone floor with a textured cream rug.",
      "LIGHTING & TEXTURE: Grazing natural morning daylight flooding through a tall window, highlighting the tactile ultra-matte Craft Lambda fine sand paper micro-relief. Zero text, zero watermarks, 100% clean video-ready base."
    ].join(" ")
  },
  {
    id: 'l40_card_04_9x16_fullwall_montessori_playroom',
    filename: 'l40_funhaus_04_9x16_fullwall_montessori_playroom.png',
    title: 'Card 4: 100% Full Wall Mural + Montessori Play Sanctuary & Bunny Chairs (Reel 2 Scene 2)',
    prompt: [
      STRICT_WALLPAPER_L40,
      "FULL-HEIGHT 100% WALL COVERAGE: The background feature wall is 100% covered from floor to ceiling with the continuous sage green and cream vertical striped wallpaper mural. Clean, borderless, seamless 1:1 match with REFERENCE_IMAGE_1.",
      "ROOM & INTERIOR (MONTESSORI PLAYROOM): A joyful, bright playroom in Fun Haus / Dopamine Decor aesthetic. A low round natural solid wood play table with two adorable bunny-ear wooden chairs. In the foreground, smooth wooden stacking toys and a low wooden toy shelf with colorful storage canvas bins (ochre yellow, soft terracotta, baby blue).",
      "COZY CORNER: In the corner, a cozy reading nook with a plush floor cushion and neatly arranged picture books. High ceiling with soft warm ambient light. Light natural oak floor.",
      "LIGHTING & OPTICS: Warm morning sunlight streaming across the entire room, casting gentle natural shadows on the floor and revealing the tactile non-woven fleece paper grain. Photographed on Sony A7R V, 35mm lens, f/5.6 aperture, edge-to-edge sharpness, zero distortion, zero text, zero watermarks."
    ].join(" ")
  }
];

const STRICT_NEGATIVE = [
  "iron bed, metal bed, steel bed, metal spindle bed, iron bars, metal headboard,",
  "black lines, black outlines, dark borders, black lines on sides of stripes, double lines,",
  "slatted wall, beadboard, vertical grooves, wood slats, 3D wall panels, pinstripes, altered stripes,",
  "peeling wallpaper, bed canopy, house bed, house-frame bed, roof frame over bed, overhead frame beams,",
  "mounted animal heads, wicker baskets, rattan furniture, plastic furniture, messy clutter,",
  "distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words"
].join(" ");

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found');

  console.log('='.repeat(75));
  console.log('🎨 GENERATING 4x 9:16 PHOTOS FOR LISTING 40 (Fun Haus / Sage Green & Cream)');
  console.log(`Wallpaper: ${path.basename(WALLPAPER_PATH)}`);
  console.log(`Output:    ${OUT_DIR}`);
  console.log('='.repeat(75));

  const wallpaperBuf = fs.readFileSync(WALLPAPER_PATH);
  const wallpaperPart = { inlineData: { data: wallpaperBuf.toString('base64'), mimeType: 'image/png' } };

  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = { inlineData: { data: texBuf.toString('base64'), mimeType: 'image/jpeg' } };
    console.log('✓ Craft Lambda texture loaded');
  }

  const ai = new GoogleGenAI({ apiKey });

  for (let i = 0; i < CARDS.length; i++) {
    const card = CARDS[i];
    const outPath = path.join(OUT_DIR, card.filename);
    const artPath = path.join(ART_DIR, card.filename);

    console.log(`\n[${i+1}/4] Generating ${card.title}...`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100000) {
      console.log(`⏭️ File already exists, skipping: ${card.filename}`);
      continue;
    }

    const parts = [
      { text: "REFERENCE_IMAGE_1 (Exact Product Artwork): Replicate this exact two-tone sage green and cream stripe pattern with 100% fidelity. Equal width stripes, zero pinstripes, zero black outlines, zero dark borders." },
      wallpaperPart
    ];
    if (texturePart) {
      parts.push({
        text: "REFERENCE_IMAGE_2 (Physical Material Texture Only): Extract ONLY the fine-grain sand texture and ultra-matte non-woven paper micro-relief. Discard any drawings or gold leaves."
      });
      parts.push(texturePart);
    }
    parts.push({ text: card.prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: '9:16',
          imageSize: '2K',
          negativePrompt: STRICT_NEGATIVE
        }
      }
    });

    const candidates = response.candidates || [];
    let saved = false;
    for (const c of candidates) {
      const resParts = c.content?.parts || [];
      for (const p of resParts) {
        if (p.inlineData && p.inlineData.data) {
          const imgBuffer = Buffer.from(p.inlineData.data, 'base64');
          fs.writeFileSync(outPath, imgBuffer);
          fs.writeFileSync(artPath, imgBuffer);
          const sizeMb = (imgBuffer.length / 1024 / 1024).toFixed(2);
          console.log(`✅ Saved ${outPath} (${sizeMb} MB)`);
          console.log(`✓ Copied to artifacts: ${artPath}`);
          saved = true;
          break;
        }
      }
      if (saved) break;
    }

    if (!saved) {
      console.error(`❌ Failed to save ${card.filename}`);
    }

    // Small delay between calls
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n🎉 ALL 4x 9:16 PHOTOS GENERATED SUCCESSFULLY FOR LISTING 40!');
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});


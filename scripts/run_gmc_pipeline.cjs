#!/usr/bin/env node

/**
 * GMC Video Marketing Pipeline Runner (CLI)
 *
 * Pipeline flow:
 * 1. Fetch live product data & all 8 room/mural assets from GMC feed (https://moonbloomwalls.com/google_shopping_feed.xml)
 * 2. Select optimal Start Frame (e.g. vertical 9:16 interior) and flat 2D wallpaper reference
 * 3. Construct Google-compliant continuity prompts (Camera Shift + Inanimate 2D Print Lock)
 * 4. Generate local artifact package in runs/GMC-<SKU>_<traceId>/
 * 5. Log telemetry with W3C traceId into gemini_sessions.json
 *
 * Default mode: --dry-run (100% free validation before spending API credits)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Helper to parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: 'https://moonbloomwalls.com/motive/fototapete-wald/salbei-nebelwald',
    motion: 'dolly_in',
    mode: 'keyframe_pair',
    engine: 'omni',
    dryRun: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' || arg === '--sku') {
      options.query = args[++i];
    } else if (arg === '--motion') {
      options.motion = args[++i];
    } else if (arg === '--mode') {
      options.mode = args[++i];
    } else if (arg === '--engine') {
      options.engine = args[++i];
    } else if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

// 2. Load API keys safely from .env.local (Zero Leak Policy)
function getEnvApiKey() {
  try {
    const envFile = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const geminiMatch = content.match(/VITE_GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/) ||
                          content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
      return geminiMatch ? geminiMatch[1] : null;
    }
  } catch (err) {
    // Ignore read errors
  }
  return process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null;
}

// 3. Simple XML fetch & parse matching services/gmc/gmcFeedService.ts
async function fetchGmcProduct(query) {
  const feedUrl = 'https://moonbloomwalls.com/google_shopping_feed.xml';
  console.log(`[GMC Pipeline] Fetching live feed: ${feedUrl}...`);

  const resp = await fetch(feedUrl, {
    headers: { 'User-Agent': 'MoonBloom-Pipeline-CLI/1.0' }
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch feed: HTTP ${resp.status}`);
  }

  const xmlText = await resp.text();
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const tagRegex = /<([a-zA-Z0-9_:]+)>([\s\S]*?)<\/\1>/gi;

  const rawItems = [];
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemBlock = itemMatch[1];
    const itemFields = {};
    let fieldMatch;

    while ((fieldMatch = tagRegex.exec(itemBlock)) !== null) {
      const tagName = fieldMatch[1].replace(/^g:/, '');
      const tagValue = fieldMatch[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      if (!itemFields[tagName]) itemFields[tagName] = [];
      itemFields[tagName].push(tagValue);
    }
    rawItems.push(itemFields);
  }

  // Filter matching items
  const q = query.trim().toLowerCase();
  const matchedItems = rawItems.filter(item => {
    const id = (item.id?.[0] || '').toLowerCase();
    const groupId = (item.item_group_id?.[0] || '').toLowerCase();
    const link = (item.canonical_link?.[0] || item.link?.[0] || '').toLowerCase();
    const title = (item.title?.[0] || '').toLowerCase();
    return id.includes(q) || groupId === q || link === q || link.includes(q) || title.includes(q);
  });

  if (matchedItems.length === 0) {
    throw new Error(`Product not found in GMC feed for query: "${query}"`);
  }

  const first = matchedItems[0];
  const itemGroupId = first.item_group_id?.[0] || first.id?.[0]?.split('-')?.[0] || 'UNKNOWN';
  const canonicalLink = first.canonical_link?.[0] || first.link?.[0] || '';
  const title = (first.title?.[0] || '').replace(/\s*–\s*\d+.*$/i, '').trim();
  const description = first.description?.[0] || '';
  const material = first.material?.[0] || 'Struktur-Vinyl auf Vliesbasis';

  let startingPriceEur = 9999;
  let samplePriceEur = 16.50;
  const sizes = [];

  for (const it of matchedItems) {
    const sizeStr = it.size?.[0] || '';
    const rawPrice = it.price?.[0] || '0.00 EUR';
    const numPrice = parseFloat(rawPrice.replace(/[^\d.]/g, '')) || 0;

    if (sizeStr.toLowerCase().includes('muster') || sizeStr.toLowerCase().includes('a4')) {
      samplePriceEur = numPrice;
    } else if (numPrice > 0 && numPrice < startingPriceEur) {
      startingPriceEur = numPrice;
    }

    sizes.push({ size: sizeStr, price: rawPrice, priceEur: numPrice });
  }

  const primaryImageUrl = first.image_link?.[0] || '';
  const additionalImageUrls = first.additional_image_link || [];
  const allImageUrls = [primaryImageUrl, ...additionalImageUrls].filter(Boolean);

  // Identify candidate flat 2D print (usually -6- on MoonBloom)
  const flatMuralCandidate = allImageUrls.find(url => url.includes('-6-')) || primaryImageUrl;

  // Identify preferred vertical 9:16 start frame (often -3- or -5-)
  const verticalStartCandidate = allImageUrls.find(url => url.includes('-3-')) ||
                                 allImageUrls.find(url => url.includes('-5-')) ||
                                 primaryImageUrl;

  return {
    itemGroupId,
    title,
    description,
    canonicalLink,
    material,
    startingPriceEur,
    samplePriceEur,
    sizes,
    primaryImageUrl,
    additionalImageUrls,
    allImageUrls,
    flatMuralImageUrl: flatMuralCandidate,
    verticalStartCandidate
  };
}

// 4. Download helper with buffer cache
async function downloadAsset(url, destPath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} downloading ${url}`);
  const arrayBuffer = await resp.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

// 5. Append event to gemini_sessions.json adhering to log-trace-debugger
function logSessionEvent(record) {
  const sessionFile = path.join(process.cwd(), 'gemini_sessions.json');
  let data = {};
  if (fs.existsSync(sessionFile)) {
    try {
      data = JSON.parse(fs.readFileSync(sessionFile, 'utf8') || '{}');
    } catch {
      data = {};
    }
  }

  const sessionId = record.sessionId || 'gmc-marketing';
  if (!data[sessionId]) {
    data[sessionId] = {
      createdTime: new Date().toISOString(),
      events: []
    };
  }

  data[sessionId].events.push(record);
  fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2), 'utf8');
}

// 6. Main execution flow
async function main() {
  const options = parseArgs();
  const traceId = crypto.randomBytes(16).toString('hex');
  const timestamp = new Date().toISOString();

  console.log('='.repeat(70));
  console.log(`🚀 GMC VIDEO MARKETING PIPELINE (MoonBloom Walls)`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Target Query: ${options.query}`);
  console.log(`Mode:         ${options.mode}`);
  console.log(`Camera:       ${options.motion}`);
  console.log(`Engine:       ${options.engine}`);
  console.log(`Execution:    ${options.dryRun ? 'DRY-RUN (Safe Validation, 0 USD)' : 'LIVE EXECUTION'}`);
  console.log('='.repeat(70));

  // Step 1: Query GMC Feed
  const product = await fetchGmcProduct(options.query);
  console.log(`\n📦 Product Identified:`);
  console.log(`   SKU:        ${product.itemGroupId}`);
  console.log(`   Title:      ${product.title}`);
  console.log(`   Starting:   ${product.startingPriceEur.toFixed(2)} EUR`);
  console.log(`   Sample A4:  ${product.samplePriceEur.toFixed(2)} EUR`);
  console.log(`   Total Img:  ${product.allImageUrls.length} assets found in GMC`);

  // Step 2: Establish Workdir in runs/
  const runDir = path.join(process.cwd(), 'runs', `GMC-${product.itemGroupId}_${traceId.slice(0, 8)}`);
  fs.mkdirSync(runDir, { recursive: true });

  const startFrameFile = path.join(runDir, 'frame_start.webp');
  const flatMuralFile = path.join(runDir, 'wallpaper_mural.webp');

  console.log(`\n📥 Fetching Primary Assets for Frame Pair:`);
  console.log(`   Start Frame (9:16):  ${product.verticalStartCandidate}`);
  console.log(`   Wallpaper Mural 2D:  ${product.flatMuralImageUrl}`);

  await downloadAsset(product.verticalStartCandidate, startFrameFile);
  await downloadAsset(product.flatMuralImageUrl, flatMuralFile);
  console.log(`   ✓ Saved to: ${path.relative(process.cwd(), runDir)}`);

  // Step 3: Build Google API Prompts
  const endFramePrompt = `Camera angle reframing within the EXACT SAME children's room interior.
Reference Image 1 shows the starting scene. Reference Image 2 shows the 1:1 flat wallpaper artwork (${product.title}).

INSTRUCTION:
Generate the ending keyframe of this EXACT SAME room, moving the camera 1.5 meters closer towards the feature wall with a subtle 10-degree diagonal reframing.

RIGID CONTINUITY & ARCHITECTURAL LOCK:
- Every piece of furniture present in Reference 1 must remain 100% physically identical: same wood finish (natural solid birch/oak), same shape, same placement relative to the room geometry.
- Same flooring, same natural woven rug, same window daylight direction and warm golden morning sunlight.
- Zero new furniture pieces, zero disappearing objects, zero stylistic alterations.
- The wallpaper on the feature wall must be a seamless 1:1 continuation of Reference 2: ${product.description}.
- Tactile non-woven wallpaper finish (Struktur-Vinyl auf Vliesbasis) with authentic soft shadow ambient occlusion along baseboards.
- Completely devoid of plastic reflections or synthetic CGI sheen. High-end editorial architectural photography.`;

  const videoPrompt = `A continuous, ultra-smooth architectural Steadicam push-in along a linear track, transitioning fluidly from the starting wide frame to the ending closer framing of the feature wall.

INTERPOLATION CONTINUITY & GEOMETRIC LOCK:
- The entire room architecture, wooden furniture, flooring, textiles, and window frame remain 100% frozen, solid, and geometrically locked.
- Absolute zero morphing, zero cross-fading, zero dissolving transitions, zero disappearing parts.
- Continuous 3D spatial coherence from the first frame to the final frame.

INANIMATE 2D INK LOCK:
- The wallpaper design (${product.title}) is flat, static 2D printed ink on textured non-woven wallpaper (Struktur-Vinyl auf Vliesbasis).
- Strictly zero biological animation, zero flapping birds, zero shifting trees, zero moving characters, and zero morphing patterns.
- Soft natural warm sunlight (Gemütlichkeit) grazes across the matte paper relief with realistic physical ambient shadows.`;

  const negativePrompt =
    "peeling wallpaper, wallpaper peeling off wall, unrolling paper, corner curl, wallpaper sheet bending, page curl, paper peeling, peeling corner, curling wallpaper, wallpaper tearing, paper lift, lifting corner, peeling paper, paper detachment, page turn, page flip, paper sweep, book page flip, page curl, paper page turning, opening transition, wipe transition, intro transition effect, transition wipe, fade-in, storybook page turn, morphing wallpaper pattern, drawing new elements on the wall, morphing arches, changing wallpaper motifs, animating the wallpaper design, moving wall prints, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry, beam crossing the frame, ceiling beam blocking the view, wooden beam passing in front of camera, pillar or column blocking the shot, foreground object flying past the camera, obstruction entering the frame, silhouette sweeping across the frame, camera passing through objects, unexpected foreground element, parallax object crossing the shot, toy swinging, hanging toy moving, mobile spinning, mobile toy swaying, crib mobile moving, stuffed toy moving, dangling object swinging, curtains appearing, curtains materializing, new curtains, drapes appearing, new drapery, fabric appearing from nowhere, hanging decoration swinging, house bed, house-frame bed, house shaped bed frame, roof frame over bed, wooden gable frame, overhead frame beams, tall bed frame obstructing wall";

  // Step 4: Estimate Cost
  // Frame B generation: ~$0.0672 (Gemini 3.1 Flash Image)
  // Video generation: ~$0.50 (Gemini Omni 1.1 Flash 720p 5s) or $0.60 (Veo 3.1 Fast 6s)
  const imageCost = 0.0672;
  const videoCost = options.engine === 'veo' ? 0.60 : 0.50;
  const estimatedCost = imageCost + videoCost;

  // Step 5: Save Manifest
  const manifest = {
    traceId,
    itemGroupId: product.itemGroupId,
    timestamp,
    mode: options.mode,
    engine: options.engine,
    plan: {
      mode: options.mode,
      cameraMotion: options.motion,
      startFrameUrl: product.verticalStartCandidate,
      flatMuralUrl: product.flatMuralImageUrl,
      referenceUrls: product.allImageUrls
    },
    prompts: {
      endFramePrompt,
      videoPrompt,
      negativePrompt
    },
    estimatedCostUsd: estimatedCost,
    status: options.dryRun ? 'dry_run' : 'started',
    meta: {
      title: product.title,
      priceStarting: product.startingPriceEur,
      samplePrice: product.samplePriceEur,
      material: product.material,
      canonicalLink: product.canonicalLink
    }
  };

  const manifestPath = path.join(runDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`   ✓ Saved Manifest: ${path.relative(process.cwd(), manifestPath)}`);

  // Step 6: Log Structured Telemetry (Log & Trace Debugger)
  logSessionEvent({
    timestamp,
    sessionId: `gmc-${product.itemGroupId}`,
    model: options.engine === 'veo' ? 'veo-3.1-fast-generate-preview' : 'gemini-omni-1.1-flash',
    prompt: videoPrompt,
    cost: options.dryRun ? 0 : estimatedCost,
    duration: 0,
    status: options.dryRun ? 'dry_run' : 'started',
    traceId,
    negativePrompt,
    aspectRatio: '9:16',
    durationSeconds: options.engine === 'veo' ? 6 : 5,
    resolution: '720p',
    gmcItemGroupId: product.itemGroupId,
    videoMode: 'start_end_interpolation',
    startImageUrl: product.verticalStartCandidate,
    endImageUrl: product.flatMuralImageUrl,
    referenceCount: product.allImageUrls.length,
    promptPreset: options.motion
  });

  console.log(`\n📋 PIPELINE RUN SUMMARY:`);
  console.log(`   Artifacts:    ${path.relative(process.cwd(), runDir)}/`);
  console.log(`   Estimated $:  ~$${estimatedCost.toFixed(2)} (Image: $${imageCost.toFixed(3)}, Video: $${videoCost.toFixed(2)})`);
  console.log(`   Telemetry:    Persisted to gemini_sessions.json [traceId=${traceId}]`);

  if (options.dryRun) {
    console.log(`\n✅ DRY-RUN SUCCESSFUL: No API credits were spent.`);
    console.log(`   Review manifest.json and frame_start.webp in runs/ before triggering live run.`);
    console.log(`   To execute live: node scripts/run_gmc_pipeline.cjs --sku ${product.itemGroupId} --execute`);
  }
}

main().catch(err => {
  console.error('\n❌ PIPELINE ERROR:', err);
  process.exit(1);
});


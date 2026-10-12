import trendsData from '../Promt/trends.json' with { type: 'json' };
import { BatchPromptTags, AgeGroupKey, BatchAspectRatio } from '../types';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

export const TAG_OPTIONS = {
  colors: trendsData.colors.map(c => c.name),
  styles: trendsData.styles.map(s => s.name),
  brands: trendsData.brands.map(b => b.name),
  ageGroups: ['baby', 'vorschul', 'schulkind', 'teenager'] as AgeGroupKey[],
  keyObjects: trendsData.keyObjects.map(k => k.name),
  roomZones: trendsData.roomZones.map(r => r.name),
  lighting: trendsData.lighting.map(l => l.name),
  cameraAngles: trendsData.cameraAngles,
  cameraElevations: (trendsData as any).cameraElevations ?? [
    "child eye-level perspective (approx. 80cm from floor)",
    "standing adult eye-level perspective",
    "low-angle perspective from the rug",
    "architectural horizontal tripod framing"
  ],
  lenses: (trendsData as any).lenses ?? [
    "35mm prime lens",
    "50mm normal lens",
    "45mm medium format lens",
    "28mm gentle wide lens"
  ],
  apertures: (trendsData as any).apertures ?? [
    "f/5.6 aperture",
    "f/8.0 aperture",
    "f/4.0 aperture"
  ],
  cameraBodies: (trendsData as any).cameraBodies ?? [
    "Sony A7R V",
    "Hasselblad H6D-100c",
    "Canon EOS R5",
    "Fujifilm GFX 100S"
  ],
  cameraDistances: trendsData.cameraDistances.map(d => d.name),
  depthOfField: trendsData.depthOfField.map(d => d.name),
  accessories: trendsData.accessories,
};

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  baby: 'Baby (0–3)',
  vorschul: 'Preschool (3–6)',
  schulkind: 'School (6–10)',
  teenager: 'Teenager (10–16)',
};

export function getKeyObjectsForAge(ageGroup: AgeGroupKey): string[] {
  const ageData = (trendsData.ageGroups as any)?.[ageGroup];
  const trendingBeds = ageData?.beds as string[] | undefined;
  const filtered = (trendsData.keyObjects as Array<{ name: string; ageGroup?: string }>)
    .filter(k => k.ageGroup === ageGroup)
    .map(k => k.name);
  if (trendingBeds && trendingBeds.length > 0) {
    return [...filtered, ...trendingBeds];
  }
  return filtered.length > 0 ? filtered : trendsData.keyObjects.map(k => k.name);
}

export const CINEMATIC_DETAILS = [
  "Dappled sunlight filters through unseen tree leaves, casting organic shadow play across the floor.",
  "Cool, crisp morning light fills the room, enhancing the fresh and airy atmosphere.",
  "A warm late-afternoon amber glow sweeps across the room, highlighting the textures of the natural wood.",
  "A soft, diffused overcast light provides perfectly even illumination, mimicking a high-end studio softbox.",
  "Dust motes dance in a single, focused shaft of sunlight cutting across the room."
];

export function generateRandomTags(aspectRatio: BatchAspectRatio, ageGroup?: AgeGroupKey): BatchPromptTags {
  const resolvedAgeGroup = ageGroup ?? pick(TAG_OPTIONS.ageGroups);
  return {
    color: pick(TAG_OPTIONS.colors),
    style: pick(TAG_OPTIONS.styles),
    brand: pick(TAG_OPTIONS.brands),
    ageGroup: resolvedAgeGroup,
    keyObject: pick(getKeyObjectsForAge(resolvedAgeGroup)),
    roomZone: pick(TAG_OPTIONS.roomZones),
    lighting: pick(TAG_OPTIONS.lighting),
    cameraAngle: pick(TAG_OPTIONS.cameraAngles),
    cameraElevation: pick(TAG_OPTIONS.cameraElevations),
    cameraDistance: pick(TAG_OPTIONS.cameraDistances),
    depthOfField: pick(TAG_OPTIONS.depthOfField),
    lens: pick(TAG_OPTIONS.lenses),
    aperture: pick(TAG_OPTIONS.apertures),
    cameraBody: pick(TAG_OPTIONS.cameraBodies),
    accessories: pickN(trendsData.accessories, 2 + Math.floor(Math.random() * 2)),
    aspectRatio,
    compositionStrategy: Math.random() < 0.4 ? 'unobstructed' : 'natural',
    cinematicDetail: pick(CINEMATIC_DETAILS),
  };
}

export function buildGeminiPrompt(tags: BatchPromptTags): string {
  const colorData = trendsData.colors.find(c => c.name === tags.color);
  const styleData = trendsData.styles.find(s => s.name === tags.style);
  const brandData = trendsData.brands.find(b => b.name === tags.brand);
  const keyObjectToUse = tags.ageGroup === 'baby' ? (tags.keyObject || 'Classic slatted wooden baby crib') : tags.keyObject;
  const keyObjData = (trendsData.keyObjects as Array<{ name: string; description: string; ageGroup?: string }>).find(k => k.name === keyObjectToUse);
  const lightingData = trendsData.lighting.find(l => l.name === tags.lighting);
  const camDistData = trendsData.cameraDistances.find(d => d.name === tags.cameraDistance);

  const material = tags.ageGroup === 'teenager'
    ? 'solid wood with visible grain, matte metal accents, clean lines'
    : 'solid wood with rich visible organic grain, tactile raw matte finish, soft rounded child-friendly edges';

  const naturalMaterials = tags.ageGroup === 'teenager'
    ? 'solid wood, matte metal, organic linen'
    : 'solid wood with visible grain, organic canvas, washed linen, breathable cotton';

  const compositionText = tags.compositionStrategy === 'unobstructed'
    ? "The composition is framed with low-profile furniture to guarantee an expansive, unobstructed panoramic view of the wallpaper mural across the wall."
    : "The shot is composed from a child-scale eye-level perspective, enhancing room depth and spatial realism.";

  const insights = (trendsData as any).latestMarketInsights as {
    colors?: Array<{ name: string; description: string }>;
    styles?: Array<{ name: string; description: string }>;
    accessories?: string[];
    materials?: string[];
  } | undefined;
  let trendingColorName = '';
  let activeAccessories = [...tags.accessories];
  let activeMaterials = naturalMaterials;

  if (insights) {
    if (Math.random() < 0.5 && insights.colors && insights.colors.length > 0) {
      const trendingColor = pick(insights.colors);
      trendingColorName = trendingColor.name;
    }
    if (Math.random() < 0.5 && insights.accessories && insights.accessories.length > 0) {
      const trendingAcc = pick(insights.accessories);
      if (!activeAccessories.includes(trendingAcc)) {
        activeAccessories.push(trendingAcc);
      }
    }
    if (Math.random() < 0.5 && insights.materials && insights.materials.length > 0) {
      const trendingMat = pick(insights.materials);
      activeMaterials += `, ${trendingMat.toLowerCase()}`;
    }
  }

  // Age-specific 2026 trends for setting, hero toys & decor
  const ageData = (trendsData.ageGroups as any)?.[tags.ageGroup];
  const trendingToy = ageData?.toys && ageData.toys.length > 0 ? pick(ageData.toys as string[]) : '';
  const trendingDecor = ageData?.decor && ageData.decor.length > 0 ? pick(ageData.decor as string[]) : '';

  let sceneSetting = '';
  let lifestyleTouch = '';
  if (tags.ageGroup === 'baby') {
    sceneSetting = "An authentic, peaceful Scandinavian nursery for a baby in a warm home. The room feels gentle, spacious, and serene, styled with calming desaturated tones (soft oat, pale cream, muted sage) and breathable organic materials to support infant rest without sensory clutter.";
    lifestyleTouch = `Authentic lived-in nursery details: soft organic cotton bedding, ${trendingToy || 'a delicate wooden mobile'}, and ${trendingDecor || 'neatly placed wooden sensory blocks catching the light'}.`;
  } else if (tags.ageGroup === 'vorschul') {
    sceneSetting = "A warm, charming Scandinavian preschool children's bedroom in an authentic home. Designed with child-scale furniture, natural light wood, and gentle earthy tones to support gentle imaginative play and restful sleep.";
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'an open illustrated children\'s book'}, ${trendingDecor || 'neatly stacked wooden building blocks'}, and a soft woven cotton floor rug.`;
  } else if (tags.ageGroup === 'schulkind') {
    sceneSetting = "A cozy, natural children's bedroom and study zone for a school-age child. Clean natural wood surfaces and soft textiles create an organized, inviting space for both learning focus and relaxed rest.";
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'an open notebook with a wooden pencil on the desk'}, ${trendingDecor || 'tidy children\'s books'}, and a comfortable floor reading cushion.`;
  } else {
    sceneSetting = "A contemporary youth bedroom with clean geometric lines, natural solid wood, subtle matte metal accents, and a calm, uncluttered layout for studying and relaxing.";
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'a small potted plant in a ceramic pot'}, ${trendingDecor || 'neatly organized books'}, and clean task lighting.`;
  }

  const wallpaperRule = "This is a commercial interior photograph showcasing a wall mural wallpaper. The reference image is a single full-scale mural (not a repeating tile pattern). FULL-HEIGHT 100% WALL COVERAGE: This entire reference image must be mapped and stretched across the feature wall edge-to-edge as a single, continuous, seamless mural covering 100% of the wall surface from the floor baseboard up to the ceiling line, running cleanly behind the furniture without any horizontal cuts, splits, wainscoting, or unpapered lower section. Retain the exact illustration, colors, and scale from the reference image 1:1. The wallpaper is the hero of the interior.";

  const furnitureSection = `The focal furniture piece is a ${brandData?.name ?? tags.brand}-inspired ${keyObjData?.name ?? tags.keyObject} crafted from ${material}. Layout: ${keyObjData?.description ?? ''}. Floor and architecture: ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}. Styling: ${styleData?.name ?? tags.style} (${styleData?.description ?? ''}). ${compositionText}`;

  let colorAccentText = `Decor accented with ${colorData?.name ?? tags.color} (${colorData?.description ?? ''}) and accessories including ${activeAccessories.slice(0, 3).join(', ')}.`;
  if (trendingColorName) {
    colorAccentText += ` Subtle accents of ${trendingColorName} harmonize across the textiles.`;
  }

  const stylingSection = `The room uses tactile natural materials: ${activeMaterials}. ${colorAccentText} ${lifestyleTouch} The palette is desaturated and warm, avoiding harsh synthetic colors, sterile glossy surfaces, or artificial lighting.`;

  const lightingSection = `Soft directional natural daylight from an adjacent window gently grazes the wallpaper, highlighting the tactile ultra-matte non-woven paper texture (Craft Lambda fine sand grain micro-relief) and creating authentic ambient shadows where furniture meets the floor and wall. Illuminated by ${lightingData?.description ?? tags.lighting}. ${tags.cinematicDetail}`;

  const angle = tags.cameraAngle || 'frontal — straight-on view of the wallpaper wall';
  const elevation = tags.cameraElevation || 'child eye-level perspective (approx. 80cm from floor)';
  const distance = camDistData?.name ?? tags.cameraDistance ?? 'medium shot';
  const cameraBody = tags.cameraBody || 'Sony A7R V';
  const lens = tags.lens || '35mm prime lens';
  const aperture = tags.aperture || 'f/5.6 aperture';

  const cameraSection = `Photographed from a ${angle} at a ${elevation} using a ${distance}. Shot on ${cameraBody}, ${lens}, ${aperture}, sharp mural focus across the entire wall, natural optical depth. Aspect ratio: ${tags.aspectRatio}.`;

  let promptText = `${wallpaperRule}\n\n${sceneSetting}\n\n${furnitureSection}\n\n${stylingSection}\n\n${lightingSection}\n\n${cameraSection}`;

  if (tags.overlayText && tags.overlayPosition) {
    const WATERCOLOR_COLORS = [
      'soft sage green',
      'soft dusty rose',
      'warm honey amber',
      'muted terracotta',
      'soft eucalyptus green',
      'soft powder blue',
      'warm caramel mustard',
      'soft lavender blush',
      'warm oat cream'
    ];
    const watercolorColor = Math.random() < 0.6 && tags.color
      ? `soft ${tags.color.toLowerCase()}`
      : pick(WATERCOLOR_COLORS);

    promptText += ` In the ${tags.overlayPosition} corner of the image, placed delicately over the floor or rug without obscuring the wallpaper, there is a small, compact, subtle ${watercolorColor} watercolor brushstroke with organic wet painterly edges and gentle natural translucency. On top of this soft watercolor patch, the text '${tags.overlayText}' is written in a graceful, fluid, aesthetic handwritten brush cursive script in warm dark charcoal ink with slight organic transparency and ink variation as if soaked into the watercolor wash. Balanced, airy, understated, and clean. Strictly no heavy oil paint, no thick impasto smears, no blue flags, no yellow stars, no geometric boxes, no stickers.`;
  }

  if (promptText.toLowerCase().includes('pc') || promptText.toLowerCase().includes('monitor') || promptText.toLowerCase().includes('screen') || promptText.toLowerCase().includes('computer')) {
    promptText += " Any computer monitor or screen is strictly turned off, appearing as a clean, blank matte dark display with zero reflections.";
  }

  const baseNegative = "peeling wallpaper, wallpaper peeling off wall, corner curl, half-wall wallpaper, split wall, wainscoting, wall paneling, dado rail, lower wall unpapered, bed canopy, hanging baldachin, fabric curtains over bed, mounted animal heads, plush animal heads, fake taxidermy, animal trophies, wicker baskets, straw baskets, rattan furniture, plastic furniture, plastic toys, bunk beds, ladders, messy clutter, distorted geometry, CGI 3D render look";

  const textNegative = (tags.overlayText && tags.overlayPosition)
    ? "heavy oil paint, thick impasto smear, solid blue flag, yellow stars, geometric boxes, harsh stickers, white outlines, digital watermark, advertising badge, low quality font"
    : "text overlay, watermark, advertising badge, corner stamp, promotional text, watercolor patch, promo brushstroke, typography, letters, words";

  promptText += ` Avoid: ${baseNegative}, ${textNegative}.`;

  return promptText;
}

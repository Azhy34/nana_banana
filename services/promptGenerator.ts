import trendsData from '../Promt/trends.json' with { type: 'json' };
import { AudienceKey, BatchPromptTags, AgeGroupKey, BatchAspectRatio, BatchPersonMode, PromptMode } from '../types';
import { buildMacroTexturePrompt, pickMacroSlotIndex } from './macroTexture';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function shuffled<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BOY_EXCLUDED_COLORS = new Set(['Dusty Rose', 'Strawberry Milk', 'Lilac Mist']);

export function getColorsForStyle(styleName: string, audience: AudienceKey = 'neutral'): string[] {
  const allowed = (trendsData.styles.find(s => s.name === styleName) as { colors?: string[] } | undefined)?.colors;
  const base = allowed && allowed.length > 0 ? allowed : trendsData.colors.map(c => c.name);
  if (audience !== 'boy') return base;
  const filtered = base.filter(c => !BOY_EXCLUDED_COLORS.has(c));
  return filtered.length > 0 ? filtered : base;
}

export const ENABLE_USP_OVERLAYS = false;

export const TAG_OPTIONS = {
  colors: trendsData.colors.map(c => c.name),
  styles: trendsData.styles.map(s => s.name),
  brands: trendsData.brands.map(b => b.name),
  ageGroups: ['baby', 'vorschul', 'schulkind', 'teenager'] as AgeGroupKey[],
  keyObjects: trendsData.keyObjects.map(k => k.name),
  roomZones: trendsData.roomZones.map(r => r.name),
  lighting: trendsData.lighting.map(l => l.name),
  cameraAngles: trendsData.cameraAngles,
  cameraElevations: trendsData.cameraElevations,
  lenses: trendsData.lenses,
  apertures: trendsData.apertures,
  cameraBodies: trendsData.cameraBodies,
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

// Key objects that are tall (a tent) or a table with chairs in the foreground are never picked at random: they hide the mural.
const NOT_MURAL_SAFE = new Set(
  (trendsData.keyObjects as Array<{ name: string; muralSafe?: boolean }>).filter(k => k.muralSafe === false).map(k => k.name),
);
export function muralSafeKeyObjects(ageGroup: AgeGroupKey): string[] {
  const all = getKeyObjectsForAge(ageGroup);
  const safe = all.filter(name => !NOT_MURAL_SAFE.has(name));
  return safe.length > 0 ? safe : all;
}

export const CINEMATIC_DETAILS = [
  "Dappled sunlight filters through unseen tree leaves, casting organic shadow play across the floor.",
  "Cool, crisp morning light fills the room, enhancing the fresh and airy atmosphere.",
  "A warm late-afternoon amber glow sweeps across the room, highlighting the textures of the natural wood.",
  "Dappled warm morning sunlight streams through tall windows, creating natural contrast and soft ambient shadows.",
  "Dust motes dance in a single, focused shaft of sunlight cutting across the room."
];

// The child comes first, then the room that fits its age (real sizes), then its toys and accessories: all of it is data of
// Promt/trends.json `ageGroups.<age>` (child, room, toys with their place, accessories). A baby's room never gets an adult bed.
export function ageLine(ageGroup: string): string {
  const age = (trendsData.ageGroups as any)?.[ageGroup] as { child?: string; room?: string } | undefined;
  return age?.child && age?.room ? `This is the room of ${age.child}. ${age.room}` : '';
}

export function accessoriesOfAge(ageGroup: string): string[] {
  const list = (trendsData.ageGroups as any)?.[ageGroup]?.accessories as string[] | undefined;
  return list && list.length > 0 ? list : trendsData.accessories;
}

export interface RandomTagOptions {
  audience?: AudienceKey;
  heroRoom?: boolean;
  macroTexture?: boolean;
  personMode?: BatchPersonMode;
  promptMode?: PromptMode;
  style?: string;
  lighting?: string;
  cameraAngle?: string;
  keyObject?: string;
}

export function generateRandomTags(
  aspectRatio: BatchAspectRatio,
  ageGroup?: AgeGroupKey,
  options: RandomTagOptions = {},
): BatchPromptTags {
  const resolvedAgeGroup = ageGroup ?? pick(TAG_OPTIONS.ageGroups);
  const audience = options.audience ?? 'neutral';
  const style = options.style ?? pick(TAG_OPTIONS.styles);
  const allowedColors = getColorsForStyle(style, audience);
  return {
    color: pick(allowedColors),
    style,
    brand: pick(TAG_OPTIONS.brands),
    ageGroup: resolvedAgeGroup,
    keyObject: options.keyObject ?? pick(muralSafeKeyObjects(resolvedAgeGroup)),
    roomZone: pick(TAG_OPTIONS.roomZones),
    lighting: options.lighting ?? pick(TAG_OPTIONS.lighting),
    cameraAngle: options.cameraAngle ?? pick(TAG_OPTIONS.cameraAngles),
    cameraElevation: pick(TAG_OPTIONS.cameraElevations),
    cameraDistance: pick(TAG_OPTIONS.cameraDistances),
    depthOfField: pick(TAG_OPTIONS.depthOfField),
    lens: pick(TAG_OPTIONS.lenses.filter(l => !l.startsWith('24mm'))),
    aperture: pick(TAG_OPTIONS.apertures),
    cameraBody: pick(TAG_OPTIONS.cameraBodies),
    accessories: pickN(accessoriesOfAge(resolvedAgeGroup), 1 + Math.floor(Math.random() * trendsData.staging.maxAccessories)),
    aspectRatio,
    compositionStrategy: Math.random() < 0.4 ? 'unobstructed' : 'natural',
    cinematicDetail: pick(CINEMATIC_DETAILS),
    wallArchitecture: 'full-wall',
    audience,
    heroRoom: options.heroRoom ?? false,
    macroTexture: options.macroTexture ?? false,
    personMode: options.personMode ?? 'none',
    promptMode: options.promptMode ?? 'full',
  };
}

/**
 * Deals a batch of non-repeating styles, lighting, camera angles, and age-appropriate furniture
 * using a shuffled deck so cards within the same batch look genuinely distinct.
 */
export function generateBatchDeck(
  formats: BatchAspectRatio[],
  options: { audience?: AudienceKey; includeHero?: boolean; includeMacro?: boolean; promptMode?: PromptMode } = {},
): BatchPromptTags[] {
  const ageGroupCycle: AgeGroupKey[] = ['baby', 'vorschul', 'schulkind', 'teenager'];
  const styleDeck = shuffled(TAG_OPTIONS.styles);
  const lightDeck = shuffled(TAG_OPTIONS.lighting);
  const angleDeck = shuffled(TAG_OPTIONS.cameraAngles);
  const keyObjDecks: Record<AgeGroupKey, string[]> = {
    baby: shuffled(muralSafeKeyObjects('baby')),
    vorschul: shuffled(muralSafeKeyObjects('vorschul')),
    schulkind: shuffled(muralSafeKeyObjects('schulkind')),
    teenager: shuffled(muralSafeKeyObjects('teenager')),
  };
  const ageCounters: Record<AgeGroupKey, number> = { baby: 0, vorschul: 0, schulkind: 0, teenager: 0 };

  // Place Hero shot on the first photo master card (prefer 2:3, 4:5, 4:3, or 3:4) if requested.
  const heroIdx = options.includeHero
    ? (() => {
        const preferred = formats.findIndex(ar => ar === '2:3' || ar === '4:5' || ar === '4:3' || ar === '3:4');
        return preferred >= 0 ? preferred : 0;
      })()
    : -1;

  // Place 1 Macro Texture in Interior shot on a non-Hero listing slot if requested.
  const macroIdx = options.includeMacro ? pickMacroSlotIndex(formats, heroIdx) : -1;

  return formats.map((ar, idx) => {
    const ageGroup = ageGroupCycle[idx % ageGroupCycle.length];
    const ageIdx = ageCounters[ageGroup]++;
    const keyDeck = keyObjDecks[ageGroup];
    return generateRandomTags(ar, ageGroup, {
      audience: options.audience ?? 'neutral',
      heroRoom: idx === heroIdx,
      macroTexture: idx === macroIdx,
      personMode: 'none',
      promptMode: options.promptMode ?? 'full',
      style: styleDeck[idx % styleDeck.length],
      lighting: lightDeck[idx % lightDeck.length],
      cameraAngle: angleDeck[idx % angleDeck.length],
      keyObject: keyDeck[ageIdx % keyDeck.length],
    });
  });
}

export function buildGeminiPrompt(tags: BatchPromptTags): string {
  const colorData = trendsData.colors.find(c => c.name === tags.color);
  const styleData = trendsData.styles.find(s => s.name === tags.style);
  const brandData = trendsData.brands.find(b => b.name === tags.brand);
  const keyObjectToUse = tags.ageGroup === 'baby' ? (tags.keyObject || 'Classic slatted wooden baby crib') : tags.keyObject;
  const keyObjData = (trendsData.keyObjects as Array<{ name: string; description: string; ageGroup?: string }>).find(k => k.name === keyObjectToUse);
  const lightingData = trendsData.lighting.find(l => l.name === tags.lighting);
  const camDistData = trendsData.cameraDistances.find(d => d.name === tags.cameraDistance);

  if (tags.macroTexture) {
    return buildMacroTexturePrompt(tags, {
      lightingDescription: lightingData?.description,
      styleName: styleData?.name ?? tags.style,
      colorName: colorData?.name ?? tags.color,
    });
  }

  const material = tags.ageGroup === 'teenager'
    ? 'solid wood with visible grain, matte metal accents, clean lines'
    : 'solid wood with rich visible organic grain, tactile raw matte finish, soft rounded child-friendly edges';

  const naturalMaterials = tags.ageGroup === 'teenager'
    ? 'solid wood, matte metal, organic linen'
    : 'solid wood with visible grain, organic canvas, washed linen, breathable cotton';

  // The mural is the hero in every prompt: a furnished room of a real size, the hero piece along a side wall with at most two small
  // accessories, everything near the mural wall low (Promt/trends.json "staging"). The tag `compositionStrategy` is kept for old cards;
  // it no longer changes this.
  const compositionText = trendsData.staging.text;

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
    const trendingForAge = (insights.accessories ?? []).filter(a => accessoriesOfAge(tags.ageGroup).includes(a));
    if (Math.random() < 0.5 && trendingForAge.length > 0) {
      const trendingAcc = pick(trendingForAge);
      if (!activeAccessories.includes(trendingAcc)) {
        activeAccessories.push(trendingAcc);
      }
    }
    if (Math.random() < 0.5 && insights.materials && insights.materials.length > 0) {
      const trendingMat = pick(insights.materials);
      activeMaterials += `, ${trendingMat.toLowerCase()}`;
    }
  }

  // Age-specific toys (low things on the floor); random decor is gone: every extra object hides the mural
  const ageData = (trendsData.ageGroups as any)?.[tags.ageGroup];
  const trendingToy = ageData?.toys && ageData.toys.length > 0 ? pick(ageData.toys as string[]) : '';

  // The chosen style (its card in trends.json) is the ONLY source of the style words: the age group gives the scale of the furniture and
  // the toys, never a style of its own.
  const styleName = styleData?.name ?? tags.style;
  const styleLabel = styleName ? ` in ${styleName} style` : '';
  let sceneSetting = '';
  let lifestyleTouch = '';
  if (tags.ageGroup === 'baby') {
    sceneSetting = `An authentic, serene nursery for a baby in a warm home${styleLabel}. The room feels gentle, joyful, and spacious, with tactile natural wood and breathable organic cotton.`;
    lifestyleTouch = `Authentic lived-in nursery details: soft organic cotton bedding and ${trendingToy || 'curated wooden sensory blocks catching the light'}.`;
  } else if (tags.ageGroup === 'vorschul') {
    sceneSetting = `A delightful, joyful children's bedroom${styleLabel}. Designed with playful child-scale furniture, natural wood, and cheerful accents that foster creativity, warmth, and restful sleep.`;
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'an open illustrated children\'s book'} and a plush cream dot rug.`;
  } else if (tags.ageGroup === 'schulkind') {
    sceneSetting = `A stylish, cozy children's bedroom and creative study sanctuary${styleLabel}. Warm natural wood surfaces, curated design touches and an uncluttered layout create an inspiring space.`;
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'an open notebook with a wooden pencil on the desk'} and a comfortable floor reading cushion.`;
  } else {
    sceneSetting = `A contemporary youth bedroom${styleLabel} with clean lines, natural solid oak and birch, and a calm, stylish layout for studying and relaxing.`;
    lifestyleTouch = `Authentic lived-in details: ${trendingToy || 'a small potted plant in a ceramic pot'} and clean task lighting.`;
  }

  sceneSetting = `${sceneSetting} ${ageLine(tags.ageGroup)}`.trim();

  const isScallop = tags.wallArchitecture === 'scallop-trim';
  const wallpaperRule = isScallop
    ? "This is a commercial interior photograph showcasing a designer wallpaper in a European children's interior. WALL ARCHITECTURE (RETRO SCALLOPED WAVE TRIM): The reference wallpaper covers the lower two-thirds of the feature wall, crowned by an eye-catching decorative scalloped wave trim moulding in warm barberry red or terracotta. Above the wavy scalloped trim, the upper wall is painted in warm chalky cream with a charming gallery of art prints in scalloped and checkered frames. Retain the exact pattern, colors, and stripe/art scale from the reference image 1:1 on the wallpaper section. The wallpaper is the hero of the interior."
    : "This is a commercial interior photograph showcasing a wall mural wallpaper. The reference image is a single full-scale mural (not a repeating tile pattern). FULL-HEIGHT 100% WALL COVERAGE: This entire reference image must be mapped and stretched across the feature wall edge-to-edge as a single, continuous, seamless mural covering 100% of the wall surface from the floor baseboard up to the ceiling line, running cleanly behind the furniture without any horizontal cuts, splits, wainscoting, or unpapered lower section. Retain the exact illustration, colors, and scale from the reference image 1:1. The wallpaper is the hero of the interior.";

  const furnitureSection = `The focal furniture piece is a ${brandData?.name ?? tags.brand}-inspired ${keyObjData?.name ?? tags.keyObject} crafted from ${material}. Layout: ${keyObjData?.description ?? ''}. Floor and architecture: ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}. Styling: ${styleData?.name ?? tags.style} (${styleData?.description ?? ''}). ${compositionText}`;

  let colorAccentText = `Interior colourway: ${colorData?.name ?? tags.color} (${colorData?.description ?? ''}), carried by the bedding, textiles, rug and small furniture so the room reads clearly in this colour family, and accessories including ${activeAccessories.slice(0, trendsData.staging.maxAccessories).join(', ')}.`;
  if (trendingColorName) {
    colorAccentText += ` Subtle accents of ${trendingColorName} harmonize across the textiles.`;
  }

  const stylingSection = `The room uses tactile natural materials: ${activeMaterials}. ${colorAccentText} ${lifestyleTouch} The styling is warm, cheerful, and tactile, featuring rich natural wood grain, soft matte ceramics, and crisp organic cotton without any artificial gloss or sterile CGI look.`;

  const lightingSection = `Grazing natural morning daylight from an adjacent window streams across the room, illuminating the tactile ultra-matte non-woven fleece paper wallpaper with subtle fine sand-grain finish and creating authentic grounding ambient shadows where furniture meets the floor and wall. Light setting: ${lightingData?.description ?? tags.lighting}. ${tags.cinematicDetail}`;

  const angle = tags.cameraAngle || TAG_OPTIONS.cameraAngles[0];
  const elevation = tags.cameraElevation || TAG_OPTIONS.cameraElevations[0];
  const distance = camDistData?.name ?? tags.cameraDistance ?? 'wide shot';
  const distanceNote = camDistData?.description ? `: ${camDistData.description}` : '';
  const cameraBody = tags.cameraBody || 'Sony A7R V';
  const lens = tags.lens || '35mm prime lens';
  const aperture = tags.aperture || 'f/5.6 aperture';

  // A tall frame cannot hold a wide mural whole without squeezing it (and half the frame becomes floor and ceiling): it shows a
  // floor-to-ceiling SECTION of the wall. Which ratios are tall and the words of that framing are data (trends.json "staging").
  const staging = trendsData.staging as { framingTall?: string; tallRatios?: string[] };
  const isTall = !!staging.framingTall && (staging.tallRatios ?? []).includes(tags.aspectRatio as string);
  const view = isTall
    ? `${angle.replace(/ and pulled well back.*$/, '')}, at ${elevation}. Framing: ${staging.framingTall}`
    : `${angle}, at ${elevation}. Framing: ${distance}${distanceNote}`;

  const personSentence = (() => {
    const mode = tags.personMode ?? 'none';
    if (mode === 'none') return '';
    const childDesc =
      tags.ageGroup === 'baby'
        ? 'a young mother in a soft oat knit cardigan and light linen trousers'
        : tags.audience === 'boy'
          ? 'a small boy of about four in a navy knit sweater and light grey trousers'
          : 'a small child of about four in a soft oat knit sweater and cream linen trousers';
    if (mode === 'child_gaze') {
      return ` In the middle of the room about two metres from the mural wall, ${childDesc} stands with their back to the camera, head tilted slightly up looking at the mural, face turned completely away from the camera so no facial detail or profile is visible.`;
    }
    return ` On the rug in the middle of the floor about two metres from the mural wall, ${childDesc} sits facing the mural with their back to the camera, playing calmly with the toys, face turned completely away from the camera so no facial detail or profile is visible.`;
  })();

  if (tags.promptMode === 'brief') {
    const isBedHero = /bed|crib|cot|daybed/i.test(keyObjData?.name ?? tags.keyObject);
    const rawToyLine = trendingToy || 'curated wooden toys and an open illustrated picture book';
    const toyLine = isBedHero ? rawToyLine : rawToyLine.replace(/\bbeside the (?:cot|bed)\b/gi, 'on the rug');
    const briefAccessories = activeAccessories
      .slice(0, trendsData.staging.maxAccessories)
      .map(a => (isBedHero ? a : a.replace(/\bon the bed\b/gi, 'neatly folded on the rug')));
    const keyDesc = keyObjData?.description ? ` (${keyObjData.description})` : '';
    const subjectText = tags.heroRoom
      ? `a bright, uncluttered children's room for a child aged 3 to 6 with a flat-weave rug and wooden toys`
      : `a ${tags.ageGroup === 'baby' ? 'serene nursery' : tags.ageGroup === 'teenager' ? 'contemporary youth bedroom' : "children's bedroom"} with ${keyObjData?.name ?? tags.keyObject}`;
    const sceneText = tags.heroRoom
      ? `A bright airy room with ${trendsData.germanApartmentContext.floorType} and white skirting boards. No bed, no nightstand, and no shelves. On a flat-weave natural wool rug in the middle of the floor lie ${toyLine}.${personSentence}`
      : `A bright airy room with ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}, with realistic true-to-life furniture proportions. Along the side wall, away from the mural: ${keyObjData?.name ?? tags.keyObject}${keyDesc} in ${material}, with ${briefAccessories.join(' and ')}. On the floor rug: ${toyLine}.${personSentence}`;
    return buildBriefPrompt({
      subject: subjectText,
      scene: sceneText,
      framing: `Photographed ${view}.`,
      lighting: lightingData?.description ?? tags.lighting,
      cameraBody,
      lens,
      aperture,
      withTexture: false,
      anchor: true,
      people: (tags.personMode && tags.personMode !== 'none') ? 'from_behind' : 'none',
      style: styleData?.name,
      color: colorData?.name,
      rules: {
        product: 'the wall mural',
        product_short: 'the mural',
        wall_rule: 'It covers the whole feature wall edge to edge, floor to ceiling, at its true scale, drawing and colours unchanged; nothing stands in front of it.',
      },
    });
  }

  const effectiveFurnitureSection = tags.heroRoom
    ? `Open hero room layout: NO bed, NO nightstand, NO shelves, NO cabinets. Floor and architecture: ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}, leaving 100% of the feature wall completely open and unobstructed from skirting board to ceiling. On a flat-weave natural wool rug in the foreground/middle of the floor rest ${trendingToy || 'two small carved wooden toys and an open illustrated picture book'}. Styling: ${styleData?.name ?? tags.style} (${styleData?.description ?? ''}).${personSentence}`
    : `${furnitureSection}${personSentence}`;

  const cameraSection = `Photographed ${view}. Shot on ${cameraBody}, ${lens}, ${aperture}, sharp mural focus across the entire wall, natural optical depth. ${trendsData.realism.photo} Aspect ratio: ${tags.aspectRatio}.`;

  let promptText = `${wallpaperRule}\n\n${sceneSetting}\n\n${effectiveFurnitureSection}\n\n${stylingSection}\n\n${lightingSection}\n\n${cameraSection}`;

  if (ENABLE_USP_OVERLAYS && tags.overlayText && tags.overlayPosition) {
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

  // The Avoid list is data (Promt/trends.json "negatives"), not code. The chosen style adds what does not suit it.
  const neg = trendsData.negatives;
  const baseNegative = [neg.head, ...(isScallop ? [] : [neg.fullWall]), neg.base].join(', ');
  const styleAvoid = (styleData as { avoid?: string } | undefined)?.avoid;
  const textNegative = (tags.overlayText && tags.overlayPosition) ? neg.textWithOverlay : neg.text;

  promptText += ` Avoid: ${baseNegative}${styleAvoid ? `, ${styleAvoid}` : ''}, ${textNegative}.`;

  return promptText;
}

// ------------------------------------------------------------------ the short ("brief") prompt
// The same file builds BOTH prompts, so the web app and the ComfyUI boards (through scripts/build_batch_prompts.mjs) read one set of
// styles and variables (Promt/trends.json) and one code. The brief is written to the official guidance of Google (Nano Banana:
// describe what you want, not what you don't; photographic terms) and OpenAI (GPT Image: scene / subject / details / constraints,
// roles of references by number): what the photo is, the two references by number, the scene, light and camera. It has no Avoid
// list and no aspect ratio / size / quality: those are fields of the request. Nothing random: the same input is the same text.
// What the code does NOT know is how the product sits on the wall: that is a fact of the LISTING and arrives as `rules`.
export const BRIEF_TEXTS = {
  intro: 'Create a photorealistic photograph of {subject}.',
  texture: 'Image 2 is a macro photo of the wallpaper paper: take only its fine sand-grain, matte surface, never its graphics.',
  uninhabited: 'The room is empty of people.',
  people: 'People: only from behind, never a face, not even in profile.', // owner rule 04.11: faces are never shown
  anchor: 'Reproduce image 1 unchanged on the wall: do not redraw, restyle or replace it.',
} as const;
export const BRIEF_PEOPLE_MODES = ['none', 'from_behind'] as const;
export const BRIEF_RULE_KEYS = ['product', 'product_short', 'wall_rule'] as const;

export interface BriefInput {
  subject: string;
  scene: string;
  framing: string;
  lighting?: string;
  cameraBody?: string;
  lens?: string;
  aperture?: string;
  withTexture?: boolean;
  anchor?: boolean;
  people?: string;
  style?: string; // a style of Promt/trends.json: its signature joins the first sentence (an unknown name is an error, not a silent skip)
  color?: string; // a colour of Promt/trends.json: the accent colour of the room
  rules?: Partial<Record<(typeof BRIEF_RULE_KEYS)[number], string>> | null;
}

export function buildBriefPrompt(input: BriefInput): string {
  const subject = (input.subject ?? '').trim().replace(/\.+$/, '');
  const scene = (input.scene ?? '').trim();
  const framing = (input.framing ?? '').trim();
  if (!(subject && scene && framing)) {
    throw new Error('a brief prompt needs subject, scene and framing (the three short texts of the card)');
  }
  const rules = input.rules ?? {};
  const missing = BRIEF_RULE_KEYS.filter(k => !(rules[k] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`a brief prompt needs the product rules of the listing [${missing.map(k => `'${k}'`).join(', ')}]: put them in the spec under "brief" (how the product sits on the wall is a fact of the listing, not of the code)`);
  }
  const people = input.people ?? 'none';
  if (!(BRIEF_PEOPLE_MODES as readonly string[]).includes(people)) {
    throw new Error(`people must be one of ('none', 'from_behind'), got '${people}'`);
  }
  const styleCard = input.style ? trendsData.styles.find(x => x.name === input.style) : undefined;
  if (input.style && !styleCard) {
    throw new Error(`unknown style '${input.style}' (Promt/trends.json has: ${trendsData.styles.map(x => x.name).join(', ')})`);
  }
  const colorCard = input.color ? trendsData.colors.find(x => x.name === input.color) : undefined;
  if (input.color && !colorCard) {
    throw new Error(`unknown colour '${input.color}' (Promt/trends.json has: ${trendsData.colors.map(x => x.name).join(', ')})`);
  }
  const gear = [input.cameraBody, input.lens, input.aperture].filter(part => part && part.trim()).map(part => (part as string).trim()).join(', ');
  const sharp = gear ? `${gear}, sharp across the whole wall.` : 'Sharp across the whole wall.';
  const productShort = (rules.product_short ?? '').trim();
  const light = input.lighting && input.lighting.trim() ? `${input.lighting.trim()}, even on ${productShort}. ` : '';
  const references = `References: image 1 is ${(rules.product ?? '').trim()}. ${(rules.wall_rule ?? '').trim()}`
    + (input.anchor ? ` ${BRIEF_TEXTS.anchor}` : '') + ((input.withTexture ?? true) ? ` ${BRIEF_TEXTS.texture}` : '');
  // The style and the colour come from the variables (their words live in Promt/trends.json only); the photographic realism
  // line is data too and is worded positively, as the guides ask.
  const intro = BRIEF_TEXTS.intro.replace('{subject}', subject)
    .replace(/\.$/, styleCard ? `, in ${styleCard.name} style (${styleCard.description}).` : '.');
  const accent = colorCard ? ` Accent colour: ${colorCard.name.toLowerCase()} (${colorCard.description}).` : '';
  return [
    intro,
    references,
    // the same staging rule as the full prompt, in positive words: nothing but the named items (the model otherwise adds baskets, throws, lamps)
    `Scene: ${scene}${accent} ${trendsData.staging.brief} ${people === 'from_behind' ? BRIEF_TEXTS.people : BRIEF_TEXTS.uninhabited}`,
    `Light and camera: ${light}${framing} ${sharp} ${trendsData.realism.photo}`,
  ].join('\n\n');
}

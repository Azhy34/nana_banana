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

const MUSHROOM_LAMP_COLORS = ['bright cobalt blue', 'sunny yellow', 'sky blue', 'pastel pink'] as const;

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
  plants: (trendsData as { plants?: string[] }).plants ?? [],
};

export type TargetAgeFilter = 'all_kids' | AgeGroupKey | AgeGroupKey[];

export function resolveAgePool(targetAge?: TargetAgeFilter): AgeGroupKey[] {
  if (!targetAge || targetAge === 'all_kids') return ['baby', 'vorschul', 'schulkind'];
  if (Array.isArray(targetAge)) return targetAge.length > 0 ? targetAge : ['baby', 'vorschul', 'schulkind'];
  return [targetAge];
}

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  baby: 'Baby (0–3)',
  vorschul: 'Preschool (3–6)',
  schulkind: 'School (6–9)',
  teenager: 'Teenager (10–16)',
};

export function getKeyObjectsForAge(ageGroup: AgeGroupKey): string[] {
  const filtered = (trendsData.keyObjects as Array<{ name: string; ageGroup?: string }>)
    .filter(k => k.ageGroup === ageGroup)
    .map(k => k.name);
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
  const base = list && list.length > 0 ? list : trendsData.accessories;
  return base.filter(a => !/chandelier|pendant|picture frames|art print|wax crayons/i.test(a));
}

export function rugsOfAge(ageGroup: string): string[] {
  return accessoriesOfAge(ageGroup).filter(a => /\b(?:rug|mat)\b/i.test(a));
}

export function nonRugAccessoriesOfAge(ageGroup: string): string[] {
  return accessoriesOfAge(ageGroup).filter(a => !/\b(?:rug|mat)\b/i.test(a));
}

export function pickAccessoriesForAge(ageGroup: string): string[] {
  const rugs = rugsOfAge(ageGroup);
  const others = nonRugAccessoriesOfAge(ageGroup);
  const pickedRug = rugs.length > 0 ? [pick(rugs)] : [];
  const pickedOther = others.length > 0 ? [pick(others)] : [];
  return [...pickedRug, ...pickedOther].slice(0, trendsData.staging.maxAccessories);
}

export interface RandomTagOptions {
  audience?: AudienceKey;
  heroRoom?: boolean;
  macroTexture?: boolean;
  cleanFloor?: boolean;
  personMode?: BatchPersonMode;
  promptMode?: PromptMode;
  style?: string;
  lighting?: string;
  cameraAngle?: string;
  keyObject?: string;
  accessories?: string[];
  plant?: string | null;
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
    accessories: options.accessories ?? pickAccessoriesForAge(resolvedAgeGroup),
    plant:
      options.plant !== undefined
        ? (options.plant ?? undefined)
        : (!options.heroRoom && !options.macroTexture && TAG_OPTIONS.plants.length > 0 && Math.random() < 0.35
            ? pick(TAG_OPTIONS.plants)
            : undefined),
    aspectRatio,
    compositionStrategy: Math.random() < 0.4 ? 'unobstructed' : 'natural',
    cinematicDetail: pick(CINEMATIC_DETAILS),
    wallArchitecture: 'full-wall',
    audience,
    heroRoom: options.heroRoom ?? false,
    macroTexture: options.macroTexture ?? false,
    cleanFloor: options.cleanFloor ?? false,
    personMode: options.personMode ?? 'none',
    promptMode: options.promptMode ?? 'full',
  };
}

export interface PeopleSceneOption {
  id: Exclude<BatchPersonMode, 'none' | 'child_gaze'>;
  label: string;
  ageGroups: AgeGroupKey[];
  template: string;
}

export const PEOPLE_SCENE_OPTIONS: readonly PeopleSceneOption[] =
  ((trendsData as any).people?.scenes as PeopleSceneOption[] | undefined) ?? [];

export function getPeopleScenesForAge(ageGroup: AgeGroupKey): PeopleSceneOption[] {
  const matching = PEOPLE_SCENE_OPTIONS.filter(s => s.ageGroups.includes(ageGroup));
  return matching.length > 0 ? matching : [...PEOPLE_SCENE_OPTIONS];
}

/**
 * Deals a batch of non-repeating styles, lighting, camera angles, and age-appropriate furniture
 * using a shuffled deck so cards within the same batch look genuinely distinct.
 */
export function generateBatchDeck(
  formats: BatchAspectRatio[],
  options: { audience?: AudienceKey; targetAge?: TargetAgeFilter; includeHero?: boolean; includeMacro?: boolean; promptMode?: PromptMode } = {},
): BatchPromptTags[] {
  const ageGroupCycle = resolveAgePool(options.targetAge);
  const styleDeck = shuffled(TAG_OPTIONS.styles);
  const lightDeck = shuffled(TAG_OPTIONS.lighting);
  const angleDeck = shuffled(TAG_OPTIONS.cameraAngles);
  const keyObjDecks: Record<AgeGroupKey, string[]> = {
    baby: shuffled(muralSafeKeyObjects('baby')),
    vorschul: shuffled(muralSafeKeyObjects('vorschul')),
    schulkind: shuffled(muralSafeKeyObjects('schulkind')),
    teenager: shuffled(muralSafeKeyObjects('teenager')),
  };
  const rugDecks: Record<AgeGroupKey, string[]> = {
    baby: shuffled(rugsOfAge('baby')),
    vorschul: shuffled(rugsOfAge('vorschul')),
    schulkind: shuffled(rugsOfAge('schulkind')),
    teenager: shuffled(rugsOfAge('teenager')),
  };
  const accDecks: Record<AgeGroupKey, string[]> = {
    baby: shuffled(nonRugAccessoriesOfAge('baby')),
    vorschul: shuffled(nonRugAccessoriesOfAge('vorschul')),
    schulkind: shuffled(nonRugAccessoriesOfAge('schulkind')),
    teenager: shuffled(nonRugAccessoriesOfAge('teenager')),
  };
  const plantDeck = shuffled(TAG_OPTIONS.plants);
  let plantGiveCounter = 0;
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

  // Assign human storytelling scenes to viral 9:16 cards and ~1/3 of photo cards (never on Hero or Macro cards)
  let videoEligibleSeen = 0;
  let photoEligibleSeen = 0;
  let cleanRoomToggle = 0;

  return formats.map((ar, idx) => {
    const ageGroup = ageGroupCycle[idx % ageGroupCycle.length];
    const ageIdx = ageCounters[ageGroup]++;
    const keyDeck = keyObjDecks[ageGroup];
    const isHero = idx === heroIdx;
    const isMacro = idx === macroIdx;

    let personMode: BatchPersonMode = 'none';
    let cardLighting = lightDeck[idx % lightDeck.length];
    let cardAngle = angleDeck[idx % angleDeck.length];

    if (!isHero && !isMacro && ageGroup !== 'teenager') {
      const agePeoplePool = getPeopleScenesForAge(ageGroup);
      if (ar === '9:16') {
        // 9:16 video masters alternate: 50% with people (child / mother+child), 25% doorway walk-in reveal, 25% sunbeam & curtain breeze
        if (videoEligibleSeen % 2 === 0 && agePeoplePool.length > 0) {
          personMode = agePeoplePool[(videoEligibleSeen / 2) % agePeoplePool.length].id;
        } else if (videoEligibleSeen % 4 === 1) {
          const doorwayAngle = (trendsData as any).people?.video9x16Archetypes?.doorway_reveal;
          if (doorwayAngle) cardAngle = doorwayAngle;
        } else {
          cardLighting = 'warm morning sunbeams';
        }
        videoEligibleSeen++;
      } else {
        // Put people on ~1 out of every 3 photo cards (starting from the 2nd eligible photo card so card #1 stays furniture-focused)
        if (photoEligibleSeen % 3 === 1 && agePeoplePool.length > 0) {
          personMode = agePeoplePool[(photoEligibleSeen + 1) % agePeoplePool.length].id;
        }
        photoEligibleSeen++;
      }
    }

    const isPlayingOnFloor = personMode === 'child_rug' || personMode === 'mother_child_rug';
    const cleanFloor = !isHero && !isMacro && !isPlayingOnFloor && (
      personMode !== 'none' || (cleanRoomToggle++ % 2 === 0)
    );

    // When audience is 'neutral', alternate explicit 'boy' and 'girl' on people cards so the child is always clearly defined
    const effectiveAudience: AudienceKey =
      (options.audience ?? 'neutral') === 'neutral' && personMode !== 'none'
        ? (idx % 2 === 0 ? 'boy' : 'girl')
        : (options.audience ?? 'neutral');

    const rugDeck = rugDecks[ageGroup];
    const accDeck = accDecks[ageGroup];
    const dealtAccessories = [
      ...(rugDeck.length > 0 ? [rugDeck[ageIdx % rugDeck.length]] : []),
      ...(accDeck.length > 0 ? [accDeck[ageIdx % accDeck.length]] : []),
    ].slice(0, trendsData.staging.maxAccessories);
    const dealtPlant =
      !isHero && !isMacro && plantDeck.length > 0 && (plantGiveCounter++ % 3 === 1)
        ? plantDeck[Math.floor(plantGiveCounter / 3) % plantDeck.length]
        : null;

    return generateRandomTags(ar, ageGroup, {
      audience: effectiveAudience,
      heroRoom: isHero,
      macroTexture: isMacro,
      cleanFloor,
      personMode,
      promptMode: options.promptMode ?? 'full',
      style: styleDeck[idx % styleDeck.length],
      lighting: cardLighting,
      cameraAngle: cardAngle,
      keyObject: keyDeck[ageIdx % keyDeck.length],
      accessories: dealtAccessories,
      plant: dealtPlant,
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
  const isCleanFloor = Boolean(tags.cleanFloor) && !tags.heroRoom && tags.personMode !== 'child_rug' && tags.personMode !== 'mother_child_rug';
  const compositionText = isCleanFloor
    ? trendsData.staging.text
        .replace('with at most two small accessories beside it, ', '')
        .replace(
          "and the child's own toys lie on the single floor rug.",
          'the single floor rug, room corners, and parquet floor are completely bare, open, and uncluttered, with only the focal furniture piece and zero toys, playhouses, or loose items on the floor.',
        )
    : trendsData.staging.text;

  const insights = (trendsData as any).latestMarketInsights as {
    colors?: Array<{ name: string; description: string }>;
    styles?: Array<{ name: string; description: string }>;
    accessories?: string[];
    materials?: string[];
  } | undefined;
  let trendingColorName = '';
  const colorizeMushroomLamp = (text: string) =>
    text.replace(
      /\b(?:a )?mid-century mushroom table lamp\b/gi,
      () => `mid-century ${pick([...MUSHROOM_LAMP_COLORS])} mushroom table lamp`,
    );
  let activeAccessories = tags.accessories.map(colorizeMushroomLamp);
  let activeMaterials = naturalMaterials;

  if (insights) {
    if (Math.random() < 0.5 && insights.colors && insights.colors.length > 0) {
      const trendingColor = pick(insights.colors);
      trendingColorName = trendingColor.name;
    }
    if (Math.random() < 0.5 && insights.materials && insights.materials.length > 0) {
      const trendingMat = pick(insights.materials);
      activeMaterials += `, ${trendingMat.toLowerCase()}`;
    }
  }

  // Age-specific toys (skipped when cleanFloor is active so half of rooms stay completely uncluttered)
  const ageData = (trendsData.ageGroups as any)?.[tags.ageGroup];
  const trendingToy = isCleanFloor
    ? ''
    : (ageData?.toys && ageData.toys.length > 0 ? pick(ageData.toys as string[]) : '');

  // The chosen style (its card in trends.json) is the ONLY source of the style words: the age group gives the scale of the furniture and
  // the toys, never a style of its own.
  const styleName = styleData?.name ?? tags.style;
  const styleLabel = styleName ? ` in ${styleName} style` : '';
  let sceneSetting = '';
  let lifestyleTouch = '';
  if (tags.ageGroup === 'baby') {
    sceneSetting = `An authentic, serene nursery for a baby in a warm home${styleLabel}. The room feels gentle, joyful, and spacious, with tactile natural wood and breathable organic cotton.`;
    lifestyleTouch = isCleanFloor
      ? 'Clean, uncluttered nursery styling with crisp organic cotton bedding and a bare floor rug.'
      : `Authentic lived-in nursery details: soft organic cotton bedding and ${trendingToy || 'curated wooden sensory blocks catching the light'}.`;
  } else if (tags.ageGroup === 'vorschul') {
    sceneSetting = `A delightful, joyful children's bedroom${styleLabel}. Designed with playful child-scale furniture, natural wood, and cheerful accents that foster creativity, warmth, and restful sleep.`;
    lifestyleTouch = isCleanFloor
      ? 'Clean, uncluttered room styling with neat bedding and an open, empty floor rug.'
      : `Authentic lived-in details: ${trendingToy || 'an open illustrated children\'s book'} on the floor rug.`;
  } else if (tags.ageGroup === 'schulkind') {
    sceneSetting = `A stylish, cozy children's bedroom and creative study sanctuary${styleLabel}. Warm natural wood surfaces, curated design touches and an uncluttered layout create an inspiring space.`;
    lifestyleTouch = isCleanFloor
      ? 'Clean, uncluttered study-bedroom styling with neat bedding and an open, empty floor rug.'
      : `Authentic lived-in details: ${trendingToy || 'an open notebook with a wooden pencil on the desk'} and a comfortable floor reading cushion.`;
  } else {
    sceneSetting = `A contemporary youth bedroom${styleLabel} with clean lines, natural solid oak and birch, and a calm, stylish layout for studying and relaxing.`;
    lifestyleTouch = isCleanFloor
      ? 'Clean, uncluttered youth room styling with neat linen bedding and an open, empty floor rug.'
      : `Authentic lived-in details: ${trendingToy || 'a small potted plant in a ceramic pot'} and clean task lighting.`;
  }

  const rawAgeLine = ageLine(tags.ageGroup);
  const effectiveAgeLine = isCleanFloor
    ? rawAgeLine.replace(/,?\s*and the play space is a quilted mat on the floor/i, '')
    : rawAgeLine;
  sceneSetting = `${sceneSetting} ${effectiveAgeLine}`.trim();

  const isScallop = tags.wallArchitecture === 'scallop-trim';
  const wallpaperRule = isScallop
    ? "This is a commercial interior photograph showcasing a designer wallpaper in a European children's interior. WALL ARCHITECTURE (RETRO SCALLOPED WAVE TRIM): The reference wallpaper covers the lower two-thirds of the feature wall, crowned by an eye-catching decorative scalloped wave trim moulding in warm barberry red or terracotta. Above the wavy scalloped trim, the upper wall is painted in warm chalky cream with a charming gallery of art prints in scalloped and checkered frames. Retain the exact pattern, colors, and stripe/art scale from the reference image 1:1 on the wallpaper section. The wallpaper is the hero of the interior."
    : "This is a commercial interior photograph showcasing a wall mural wallpaper. The reference image is a single full-scale mural (not a repeating tile pattern). FULL-HEIGHT 100% WALL COVERAGE: This entire reference image must be mapped and stretched across the feature wall edge-to-edge as a single, continuous, seamless mural covering 100% of the wall surface from the floor baseboard up to the ceiling line, running cleanly behind the furniture without any horizontal cuts, splits, wainscoting, or unpapered lower section. Retain the exact illustration, colors, and scale from the reference image 1:1. The wallpaper is the hero of the interior.";

  const rawKeyDesc = keyObjData?.description ?? 'realistic European child-bedroom proportions';
  const keyDescWithLampColor = rawKeyDesc.replace(
    'a mid-century mushroom table lamp',
    () => `a mid-century ${pick([...MUSHROOM_LAMP_COLORS])} mushroom table lamp`,
  );
  const furnitureSection = `Focal furniture: ${brandData?.name ?? tags.brand}-inspired ${keyObjData?.name ?? tags.keyObject} crafted from ${material} (${keyDescWithLampColor}). Architecture: ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}; all items near the mural wall stay under 90 cm so the mural remains open. ${compositionText}`;

  let colorAccentText = `Interior colourway: ${colorData?.name ?? tags.color} (${colorData?.description ?? ''}), carried by the bedding, rug, and accessories (${activeAccessories.slice(0, trendsData.staging.maxAccessories).join(', ')}).`;
  if (trendingColorName) {
    colorAccentText += ` Subtle ${trendingColorName} accents harmonize across the textiles.`;
  }

  const plantLine = tags.plant && !tags.heroRoom && !tags.macroTexture ? ` Statement greenery: ${tags.plant}.` : '';
  const stylingSection = `The room uses tactile natural materials: ${activeMaterials}. ${colorAccentText} ${lifestyleTouch}${plantLine}`;

  const lightingSection = `Grazing natural morning daylight from an adjacent window illuminates the ultra-matte non-woven fleece paper wallpaper with subtle fine sand-grain finish and casts soft grounding shadows. Light setting: ${lightingData?.description ?? tags.lighting}.`;

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
    const rawMode = tags.personMode ?? 'none';
    if (rawMode === 'none') return '';
    const normalizedMode = rawMode === 'child_gaze' ? 'child_pointing' : rawMode;
    const peopleData = (trendsData as any).people as {
      childByAudience?: Record<AudienceKey, Record<AgeGroupKey, string>>;
      scenes?: PeopleSceneOption[];
    } | undefined;
    const aud: AudienceKey = tags.audience ?? 'neutral';
    const resolvedGender: 'boy' | 'girl' =
      aud === 'boy' ? 'boy' : aud === 'girl' ? 'girl' : (tags.style.length % 2 === 0 ? 'boy' : 'girl');
    const childDesc =
      peopleData?.childByAudience?.[resolvedGender]?.[tags.ageGroup] ??
      (resolvedGender === 'boy'
        ? 'a young boy of about 4 years in a beige knit sweater and light linen trousers'
        : 'a young girl of about 4 years in a soft oat knit cardigan and linen dress');
    const sceneEntry = peopleData?.scenes?.find(s => s.id === normalizedMode);
    if (sceneEntry) {
      return ` ${sceneEntry.template.replace('{child}', childDesc)}`;
    }
    return ` On the rug in the middle of the floor in front of the mural wall, ${childDesc} sits facing the mural with their back to the camera, playing calmly with natural wooden toys.`;
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
    const briefPlant = tags.plant && !tags.heroRoom && !tags.macroTexture ? ` ${tags.plant}.` : '';
    const sceneText = tags.heroRoom
      ? `A bright airy room with ${trendsData.germanApartmentContext.floorType} and white skirting boards. No bed, no nightstand, and no shelves. On a flat-weave natural wool rug in the middle of the floor lie ${toyLine}.${personSentence}`
      : `A bright airy room with ${trendsData.germanApartmentContext.floorType} under a ${trendsData.germanApartmentContext.ceilingHeight}, with realistic true-to-life furniture proportions. Along the side wall, away from the mural: ${keyObjData?.name ?? tags.keyObject}${keyDesc} in ${material}, with ${briefAccessories.join(' and ')}. On the floor rug: ${toyLine}.${briefPlant}${personSentence}`;
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

  // Compact guardrails (no synonym spam) from Promt/trends.json
  const neg = trendsData.negatives as { head: string; fullWall: string; compact?: string; base: string; text: string; textWithOverlay: string };
  const baseNegative = [neg.head, ...(isScallop ? [] : [neg.fullWall]), neg.compact ?? neg.base].join(', ');
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

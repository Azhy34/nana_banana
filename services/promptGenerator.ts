import trendsData from '../Promt/trends.json';
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
  const filtered = (trendsData.keyObjects as Array<{ name: string; ageGroup?: string }>)
    .filter(k => k.ageGroup === ageGroup)
    .map(k => k.name);
  return filtered.length > 0 ? filtered : trendsData.keyObjects.map(k => k.name);
}

export const CINEMATIC_DETAILS = [
  "Dappled sunlight filters through unseen tree leaves, casting organic shadow play across the floor.",
  "A subtly blurred edge of a sheer linen canopy in the extreme foreground creates incredible cinematic depth.",
  "Cool, crisp morning light fills the room, enhancing the fresh and airy atmosphere.",
  "A warm late-afternoon amber glow sweeps across the room, highlighting the textures of the natural wood.",
  "A soft, diffused overcast light provides perfectly even illumination, mimicking a high-end studio softbox.",
  "Dust motes dance in a single, focused shaft of sunlight cutting across the room.",
  "A partially obscured pendant light in the foreground frames the shot, adding a layer of architectural realism."
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
    cameraDistance: pick(TAG_OPTIONS.cameraDistances),
    depthOfField: pick(TAG_OPTIONS.depthOfField),
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
  const keyObjData = (trendsData.keyObjects as Array<{ name: string; description: string; ageGroup?: string }>).find(k => k.name === tags.keyObject);
  const roomZoneData = trendsData.roomZones.find(r => r.name === tags.roomZone);
  const lightingData = trendsData.lighting.find(l => l.name === tags.lighting);
  const camDistData = trendsData.cameraDistances.find(d => d.name === tags.cameraDistance);
  const dofData = trendsData.depthOfField.find(d => d.name === tags.depthOfField);
  const ageData = (trendsData.ageGroups as Record<string, { label: string; furniture: string; storage: string; extras: string }>)[tags.ageGroup];

  const material = tags.ageGroup === 'teenager'
    ? 'modern materials, clean lines'
    : 'solid wood, soft rounded edges (Weiche Formen)';
  const naturalMaterials = tags.ageGroup === 'teenager'
    ? 'wood, matte metal accents, minimal textile'
    : 'solid wood, rattan, jute, linen, cotton';

  const compositionText = tags.compositionStrategy === 'unobstructed'
    ? "The composition is strictly optimized for selling the wallpaper: furniture is strategically kept low or positioned at dynamic angles to guarantee a massive, unobstructed, panoramic view of the feature wall. The wall occupies the absolute majority of the frame."
    : "The shot is composed from a slightly lower, waist-level perspective (adapted for a child's scale), expanding the spatial depth and elevating the grandeur of the wallpapered wall while maintaining a natural room layout.";

  let promptText = `This is a high-end product listing photograph for an interior wallpaper. The provided reference image IS the exact wallpaper pattern. It is strictly mandatory that this pattern is applied flawlessly to the entire feature wall, completely 1:1, without any alteration, recoloring, rescaling, or distortion. The wallpaper is the absolute visual hero of this image.

A breathtaking, photorealistic 8K architectural interior shot of a ${ageData?.label ?? tags.ageGroup} bedroom, specifically focusing on the ${roomZoneData?.name ?? tags.roomZone}. The scene is masterfully designed in a ${styleData?.name ?? tags.style} style (${styleData?.description ?? ''}), radiating an atmosphere of Nachhaltigkeit (eco-friendliness), Gemütlichkeit (coziness), and quiet sophistication.

The room features a ${brandData?.name ?? tags.brand}-inspired ${keyObjData?.name ?? tags.keyObject} crafted from ${material}. This central piece is situated on a classic ${trendsData.germanApartmentContext.floorType} within a spacious room boasting a ${trendsData.germanApartmentContext.ceilingHeight}. The overall scene unfolds as: ${keyObjData?.description ?? tags.keyObject}. ${compositionText}

The space is immaculately styled and exceptionally organized, strictly utilizing natural materials such as ${naturalMaterials}. The decor is tastefully accented with ${colorData?.name ?? tags.color} (${colorData?.description ?? ''}) and thoughtfully placed accessories, including ${tags.accessories.join(', ')}. The room blends magazine-level styling with curated, authentic lifestyle touches—a softly draped linen throw, an open beautifully illustrated book, or a wooden toy catching a stray sunbeam. It feels incredibly inviting and playful yet serene, avoiding sterile 3D-render aesthetics entirely. Additional context: ${ageData?.extras ?? ''}. The environment is completely devoid of plastic, clutter, or visual noise, maintaining a premium and flawless look.

The photograph is taken from a ${tags.cameraAngle} using a ${camDistData?.name ?? tags.cameraDistance} (${camDistData?.description ?? ''}), combined with a ${dofData?.name ?? tags.depthOfField} (${dofData?.setting ?? ''}) to ensure the majestic wallpapered wall remains perfectly sharp and clearly visible. ${tags.cinematicDetail}

Soft, directional natural light gently grazes the wallpaper, creating subtle ambient occlusion and authentic room shadows that ground the pattern into the physical 3D space. This lighting proves the wall is a physical object, yet flawlessly preserves the true, exact colors of the original design. The space is gorgeously illuminated by ${lightingData?.description ?? tags.lighting}, yielding warm natural tones, soft contrast, and highly realistic textures throughout. Aspect ratio: ${tags.aspectRatio}.`;

  if (tags.overlayText && tags.overlayPosition) {
    const matchingColor = tags.color ? `soft ${tags.color.toLowerCase()}` : 'soft pastel pink';
    promptText += ` In the ${tags.overlayPosition} corner of the image, there is a small, subtle ${matchingColor} watercolor brushstroke. On top of the brushstroke, the text '${tags.overlayText}' is written in a clear, highly readable, elegant handwritten cursive font, in a warm charcoal-grey color. Balanced and clean.`;
  }

  return promptText;
}

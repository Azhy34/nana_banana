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

  return `WALLPAPER PRODUCT LISTING PHOTO. The wallpaper pattern on the wall IS the product being sold — it must be the visual hero of this image. The room and furniture exist only to show the wallpaper in context.

Reference image role: this is the wallpaper pattern. Seamlessly apply it to the ENTIRE feature wall, preserving every detail of the pattern, colors, scale and texture exactly. Do not alter, recolor, rescale, blur or simplify the pattern in any way.

Professional interior photography, 8K, photorealistic.
${ageData?.label ?? tags.ageGroup} bedroom, ${roomZoneData?.name ?? tags.roomZone} focus.
Style: ${styleData?.name ?? tags.style} — ${styleData?.description ?? ''}.

Subject: ${brandData?.name ?? tags.brand}-inspired ${keyObjData?.name ?? tags.keyObject}, ${material}.
Scene: ${keyObjData?.description ?? tags.keyObject}.
Location: ${trendsData.germanApartmentContext.floorType}, approx. ${trendsData.germanApartmentContext.roomSize}, ${trendsData.germanApartmentContext.ceilingHeight}.
Action: beautifully styled, calm and organized room scene. The wallpapered wall is clearly and fully visible — it is the main visual element.
Room accent color: ${colorData?.name ?? tags.color} (${colorData?.description ?? ''}). Natural materials: ${naturalMaterials}.
Accessories: ${tags.accessories.join(', ')}. Room context: ${ageData?.extras ?? ''}.

Camera: ${tags.cameraAngle}, ${camDistData?.name ?? tags.cameraDistance} (${camDistData?.description ?? ''}), ${dofData?.name ?? tags.depthOfField} ${dofData?.setting ?? ''}.
Lighting: ${lightingData?.description ?? tags.lighting}.
Color grading: warm natural tones, soft contrast.
Aspect ratio: ${tags.aspectRatio}.

Atmosphere: Nachhaltigkeit (eco-friendly), Gemütlichkeit (coziness), Multifunktionalität.

Negative prompt: ${trendsData.negativePrompt}.`;
}

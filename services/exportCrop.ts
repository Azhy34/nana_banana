import { BatchAspectRatio } from '../types';

/**
 * Single source of truth for client-side Canvas export presets (0 credits, 0 extra API calls).
 *
 * Strategy:
 * - Generate photos once in master 2:3 (~1696x2528 at 2K), which works on 100% of models.
 * - Export deterministically in browser Canvas:
 *   - Site / Google Shopping / Meta Feed & Carousel: 4:5 (1440x1800, center crop trims 8.3% top/bottom)
 *   - Pinterest Pin & Catalog: 2:3 (1000x1500, zero crop)
 *   - Meta Video / FB Feed Carousel: 1:1 (1080x1080, center crop)
 * - 9:16 video master cards stay 9:16 (1080x1920) in bundle mode so 30% of the frame is never sliced off.
 */

export type ExportPresetId =
  | 'pack_4x5_2x3'
  | 'site_meta_4x5'
  | 'pinterest_2x3'
  | 'meta_square_1x1'
  | 'original';

export interface ExportTargetSpec {
  suffix: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  quality: number;
}

export interface ExportPresetOption {
  id: ExportPresetId;
  label: string;
  shortLabel: string;
  hint: string;
}

export const EXPORT_PRESET_OPTIONS: readonly ExportPresetOption[] = [
  {
    id: 'pack_4x5_2x3',
    label: 'Пак: Сайт/Meta 4:5 + Pinterest 2:3',
    shortLabel: '4:5 + 2:3',
    hint: 'Из каждого 2:3 кадра качает 1440×1800 (4:5) и 1000×1500 (2:3); 9:16 кадры идут как 1080×1920',
  },
  {
    id: 'site_meta_4x5',
    label: 'Сайт / Meta 4:5 (1440×1800)',
    shortLabel: '4:5',
    hint: 'Единый портрет для moonbloomwalls.com, Google Shopping и Meta Feed/Carousel',
  },
  {
    id: 'pinterest_2x3',
    label: 'Pinterest 2:3 (1000×1500)',
    shortLabel: '2:3',
    hint: 'Стандарт Pinterest для органических пинов, рекламы и каталога',
  },
  {
    id: 'meta_square_1x1',
    label: 'Meta Carousel 1:1 (1080×1080)',
    shortLabel: '1:1',
    hint: 'Квадрат для Facebook Feed каруселей и IG-каруселей с видео',
  },
  {
    id: 'original',
    label: 'Оригинал (без кропа)',
    shortLabel: 'Оригинал',
    hint: 'Скачать исходный файл модели без изменения размера',
  },
];

const TARGET_SPECS: Record<Exclude<ExportPresetId, 'pack_4x5_2x3' | 'original'> | 'video_9x16', ExportTargetSpec> = {
  site_meta_4x5: { suffix: 'site-meta-4x5', width: 1440, height: 1800, mimeType: 'image/jpeg', quality: 0.92 },
  pinterest_2x3: { suffix: 'pinterest-2x3', width: 1000, height: 1500, mimeType: 'image/jpeg', quality: 0.92 },
  meta_square_1x1: { suffix: 'meta-1x1', width: 1080, height: 1080, mimeType: 'image/jpeg', quality: 0.92 },
  video_9x16: { suffix: 'reels-9x16', width: 1080, height: 1920, mimeType: 'image/jpeg', quality: 0.92 },
};

/**
 * Computes centered cover-crop rectangle keeping 100% of the constraining axis
 * and trimming evenly from both edges of the longer axis.
 */
export function computeCenterCoverRect(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH;
  const dstRatio = targetW / targetH;
  if (Math.abs(srcRatio - dstRatio) < 0.001) {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  }
  if (srcRatio > dstRatio) {
    const sw = Math.round(srcH * dstRatio);
    const sx = Math.round((srcW - sw) / 2);
    return { sx, sy: 0, sw, sh: srcH };
  }
  const sh = Math.round(srcW / dstRatio);
  const sy = Math.round((srcH - sh) / 2);
  return { sx: 0, sy, sw: srcW, sh };
}

/** Resolves which export target(s) should be produced for a card of a given aspect ratio. */
export function resolveTargetsForCard(
  cardRatio: BatchAspectRatio,
  preset: ExportPresetId,
): ExportTargetSpec[] {
  if (preset === 'original') return [];
  if (preset === 'pack_4x5_2x3') {
    if (cardRatio === '9:16') {
      return [TARGET_SPECS.video_9x16];
    }
    return [TARGET_SPECS.site_meta_4x5, TARGET_SPECS.pinterest_2x3];
  }
  return [TARGET_SPECS[preset]];
}

async function fetchImageBlob(sourceUrl: string): Promise<Blob> {
  if (sourceUrl.startsWith('data:')) {
    const res = await fetch(sourceUrl);
    return res.blob();
  }
  try {
    const direct = await fetch(sourceUrl, { mode: 'cors' });
    if (direct.ok) return direct.blob();
  } catch {
    // Fall back to same-origin proxy when external CDN lacks CORS headers
  }
  const proxied = await fetch('/api/kie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fetchImage', url: sourceUrl }),
  });
  if (!proxied.ok) {
    throw new Error(`Failed to load image for export (${proxied.status})`);
  }
  return proxied.blob();
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image for Canvas crop'));
    };
    img.src = objectUrl;
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 150);
}

async function renderCroppedBlob(img: HTMLImageElement, target: ExportTargetSpec): Promise<Blob> {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const rect = computeCenterCoverRect(srcW, srcH, target.width, target.height);

  // Never upscale beyond source cropped pixels to avoid soft interpolation on smaller previews
  const outW = Math.min(target.width, rect.sw);
  const outH = Math.min(target.height, rect.sh);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export returned empty blob'))),
      target.mimeType,
      target.quality,
    );
  });
}

/**
 * Exports a single generated card according to the selected preset (original or 1..2 cropped JPEGs).
 */
export async function exportCardImage(
  sourceUrl: string,
  cardIndex: number,
  cardRatio: BatchAspectRatio,
  preset: ExportPresetId,
): Promise<void> {
  const targets = resolveTargetsForCard(cardRatio, preset);
  const blob = await fetchImageBlob(sourceUrl);

  if (targets.length === 0) {
    const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
    triggerBlobDownload(blob, `wallpaper-${cardIndex}-${cardRatio.replace(':', 'x')}.${ext}`);
    return;
  }

  const img = await loadImageFromBlob(blob);
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const outBlob = await renderCroppedBlob(img, target);
    triggerBlobDownload(outBlob, `wallpaper-${cardIndex}-${target.suffix}.jpg`);
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

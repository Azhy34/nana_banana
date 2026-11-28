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
  | 'pack_all'
  | 'pack_4x5_2x3'
  | 'etsy_pack'
  | 'etsy_cover_4x3'
  | 'etsy_square_1x1'
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
    id: 'pack_all',
    label: 'Пак: Все форматы (4:5 + 2:3 + 1:1)',
    shortLabel: 'Все (4:5+2:3+1:1)',
    hint: 'Из каждого 2:3 кадра качает 1440×1800 (4:5), 1000×1500 (2:3) и 1080×1080 (1:1); 9:16 кадры идут как 1080×1920',
  },
  {
    id: 'pack_4x5_2x3',
    label: 'Пак: Сайт/Meta 4:5 + Pinterest 2:3',
    shortLabel: '4:5 + 2:3',
    hint: 'Из каждого 2:3 кадра качает 1440×1800 (4:5) и 1000×1500 (2:3); 4:3 идёт как 2700×2025; 9:16 как 1080×1920',
  },
  {
    id: 'etsy_pack',
    label: 'Пак Etsy (4:3 2700×2025 + 4:5 1600×2000)',
    shortLabel: 'Etsy Пак',
    hint: '4:3 обложка (Rank 1) → 2700×2025.jpg; 2:3/4:5 галерея (Rank 2–10) → 1600×2000.jpg (≥2000px); 9:16 → 1080×1920.jpg',
  },
  {
    id: 'etsy_cover_4x3',
    label: 'Etsy Обложка 4:3 (2700×2025)',
    shortLabel: 'Etsy 4:3',
    hint: 'Горизонтальная обложка Rank 1 для Etsy (2700×2025 .jpg, sRGB, без WARN и с зумом)',
  },
  {
    id: 'etsy_square_1x1',
    label: 'Etsy Квадрат 1:1 (2000×2000)',
    shortLabel: 'Etsy 1:1',
    hint: 'Универсальный квадрат 2000×2000 .jpg для мобильного и десктопного поиска Etsy',
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

const TARGET_SPECS: Record<
  Exclude<ExportPresetId, 'pack_all' | 'pack_4x5_2x3' | 'etsy_pack' | 'original'> | 'etsy_gallery_4x5' | 'video_9x16',
  ExportTargetSpec
> = {
  etsy_cover_4x3: { suffix: 'etsy-cover-4x3', width: 2700, height: 2025, mimeType: 'image/jpeg', quality: 0.9 },
  etsy_square_1x1: { suffix: 'etsy-1x1', width: 2000, height: 2000, mimeType: 'image/jpeg', quality: 0.9 },
  etsy_gallery_4x5: { suffix: 'etsy-4x5', width: 1600, height: 2000, mimeType: 'image/jpeg', quality: 0.9 },
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
  if (preset === 'etsy_pack') {
    if (cardRatio === '4:3') return [TARGET_SPECS.etsy_cover_4x3];
    if (cardRatio === '9:16') return [TARGET_SPECS.video_9x16];
    return [TARGET_SPECS.etsy_gallery_4x5];
  }
  if (preset === 'pack_all') {
    if (cardRatio === '9:16') return [TARGET_SPECS.video_9x16];
    if (cardRatio === '4:3') return [TARGET_SPECS.etsy_cover_4x3, TARGET_SPECS.etsy_square_1x1];
    return [TARGET_SPECS.site_meta_4x5, TARGET_SPECS.pinterest_2x3, TARGET_SPECS.meta_square_1x1];
  }
  if (preset === 'pack_4x5_2x3') {
    if (cardRatio === '9:16') return [TARGET_SPECS.video_9x16];
    if (cardRatio === '4:3') return [TARGET_SPECS.etsy_cover_4x3];
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

export function getModelShortTag(model?: string): string {
  if (!model) return '';
  if (model.includes('gemini-3.1-flash')) return 'flash31';
  if (model.includes('gemini-3-pro')) return 'pro';
  if (model.includes('nano-banana-pro')) return 'nbpro';
  if (model.includes('nano-banana')) return 'nb21';
  if (model.includes('gpt-image-2')) return 'gpt2';
  if (model.includes('grok')) return 'grok';
  if (model.includes('qwen')) return 'qwen2';
  return model.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

export function buildExportFilename(
  cardIndex: number,
  suffix: string,
  width: number,
  height: number,
  ext: string = 'jpg',
  model?: string,
): string {
  const num = String(cardIndex).padStart(2, '0');
  const modelTag = getModelShortTag(model);
  return modelTag
    ? `wallpaper-${num}_${modelTag}_${suffix}_${width}x${height}.${ext}`
    : `wallpaper-${num}_${suffix}_${width}x${height}.${ext}`;
}

async function renderCroppedBlob(
  img: HTMLImageElement,
  target: ExportTargetSpec,
): Promise<{ blob: Blob; width: number; height: number }> {
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas export returned empty blob'))),
      target.mimeType,
      target.quality,
    );
  });
  return { blob, width: outW, height: outH };
}

export interface RenderedExportFile {
  folder: string;
  filename: string;
  blob: Blob;
}

/**
 * Renders all target files for a single card with dimensions included in both folder and filename.
 */
export async function renderCardExports(
  sourceUrl: string,
  cardIndex: number,
  cardRatio: BatchAspectRatio,
  preset: ExportPresetId,
  model?: string,
): Promise<RenderedExportFile[]> {
  const targets = resolveTargetsForCard(cardRatio, preset);
  const blob = await fetchImageBlob(sourceUrl);
  const img = await loadImageFromBlob(blob);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  if (targets.length === 0) {
    const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
    return [{
      folder: `original_${cardRatio.replace(':', 'x')}`,
      filename: buildExportFilename(cardIndex, 'original', srcW, srcH, ext, model),
      blob,
    }];
  }

  const files: RenderedExportFile[] = [];
  for (const target of targets) {
    const rendered = await renderCroppedBlob(img, target);
    files.push({
      folder: `${target.suffix}_${rendered.width}x${rendered.height}`,
      filename: buildExportFilename(cardIndex, target.suffix, rendered.width, rendered.height, 'jpg', model),
      blob: rendered.blob,
    });
  }
  return files;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds an uncompressed (STORED) PKZIP archive in-memory (ideal for already-compressed JPEGs).
 */
export function buildZipBlob(entries: Array<{ path: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true);      // STORED
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd] as BlobPart[], { type: 'application/zip' });
}

/**
 * Exports a single generated card according to the selected preset (original or cropped JPEGs with dimensions).
 */
export async function exportCardImage(
  sourceUrl: string,
  cardIndex: number,
  cardRatio: BatchAspectRatio,
  preset: ExportPresetId,
  model?: string,
): Promise<void> {
  const files = await renderCardExports(sourceUrl, cardIndex, cardRatio, preset, model);
  for (let i = 0; i < files.length; i++) {
    triggerBlobDownload(files[i].blob, files[i].filename);
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

/**
 * Exports multiple cards in one click as a structured ZIP archive grouped by format/dimension folders.
 */
export async function exportCardsAsZip(
  cards: Array<{ sourceUrl: string; cardIndex: number; cardRatio: BatchAspectRatio; model?: string }>,
  preset: ExportPresetId,
  zipFilename: string = `moonbloom-export-${preset}.zip`,
): Promise<number> {
  const entries: Array<{ path: string; data: Uint8Array }> = [];
  for (const card of cards) {
    const files = await renderCardExports(card.sourceUrl, card.cardIndex, card.cardRatio, preset, card.model);
    for (const file of files) {
      const buf = await file.blob.arrayBuffer();
      entries.push({
        path: `${file.folder}/${file.filename}`,
        data: new Uint8Array(buf),
      });
    }
  }
  if (entries.length === 0) return 0;
  const zipBlob = buildZipBlob(entries);
  triggerBlobDownload(zipBlob, zipFilename);
  return entries.length;
}

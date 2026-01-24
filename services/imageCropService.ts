/**
 * Image Crop Service для Etsy
 * Поддерживает стандарты Etsy (3000px+), JPG 100%, PNG Lossless, sRGB.
 */

export type AnchorPoint = 
  | 'center' 
  | 'top' 
  | 'bottom' 
  | 'left' 
  | 'right' 
  | 'top-left' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-right';

export type ExportFormat = 'jpeg' | 'png';

export interface CropPreset {
  id: string;
  name: string;
  label: string;
  description: string;
  width: number;
  height: number;
  category: 'primary' | 'secondary' | 'social';
  icon: string;
  defaultZoom?: number;
  defaultAnchor?: AnchorPoint;
  specialMode?: 'tile' | 'warp';
}

export const ETSY_PRESETS: CropPreset[] = [
  // ⭐ Основные фото (High Priority)
  {
    id: 'main_4_3',
    name: 'main_4_3',
    label: '🖼️ Главное 4:3',
    description: 'Основной формат товара на Etsy (3000x2250)',
    width: 3000,
    height: 2250,
    category: 'primary',
    icon: '🖼️',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'thumb_square',
    name: 'thumb_square',
    label: '📸 Квадрат превью',
    description: 'Для качественных thumbnails (2000x2000)',
    width: 2000,
    height: 2000,
    category: 'primary',
    icon: '📸',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'vertical_wall',
    name: 'vertical_wall',
    label: '📐 Вертикаль',
    description: 'Вид стены в полный рост (2000x2700)',
    width: 2000,
    height: 2700,
    category: 'primary',
    icon: '📐',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'lifestyle_context',
    name: 'lifestyle_context',
    label: '🛋️ Lifestyle',
    description: 'Фото в интерьере с контекстом (2400x1800)',
    width: 2400,
    height: 1800,
    category: 'primary',
    icon: '🛋️',
    defaultZoom: 1.4,
    defaultAnchor: 'center',
  },
  {
    id: 'detail_macro_front',
    name: 'detail_macro_front',
    label: '🔍 Детали (прямо)',
    description: 'Макро-текстуры центральной части (2000x2000)',
    width: 2000,
    height: 2000,
    category: 'primary',
    icon: '🔍',
    defaultZoom: 2.5,
    defaultAnchor: 'center',
  },

  // 🔍 Дополнительные (Secondary) - НАКЛОНЫ И МОКАПЫ
  {
    id: 'perspective_warp',
    name: 'perspective_warp',
    label: '📐 Наклон / Мокап',
    description: 'Идеальное наложение паттерна на стену с сохранением теней',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '📐',
    specialMode: 'warp',
  },
  {
    id: 'size_map',
    name: 'size_map',
    label: '📏 Размерная карта',
    description: 'Инфографика размеров',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '📏',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'pattern_repeat',
    name: 'pattern_repeat',
    label: '🔄 Повтор паттерна',
    description: 'Демонстрация стыковки (плитка 2x2)',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🔄',
    specialMode: 'tile',
  },

  // 📱 Соцсети (Social Media)
  {
    id: 'insta_feed',
    name: 'insta_feed',
    label: '📸 Instagram 4:5',
    description: 'Квадрат для ленты (1080x1350)',
    width: 1080,
    height: 1350,
    category: 'social',
    icon: '📸',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'stories_reels',
    name: 'stories_reels',
    label: '📲 Stories',
    description: 'Вертикаль для Reels/Stories (1080x1920)',
    width: 1080,
    height: 1920,
    category: 'social',
    icon: '📲',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
  {
    id: 'pinterest_pin',
    name: 'pinterest_pin',
    label: '📌 Pinterest',
    description: 'Оптимальный формат для пинов (1000x1500)',
    width: 1000,
    height: 1500,
    category: 'social',
    icon: '📌',
    defaultZoom: 1.0,
    defaultAnchor: 'center',
  },
];

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Рассчитывает область кропа для заполнения (cover) целевого прямоугольника
 * с учетом зума и точки привязки.
 */
export const calculateCropArea = (
  imgWidth: number,
  imgHeight: number,
  targetWidth: number,
  targetHeight: number,
  zoom: number = 1.0,
  anchor: AnchorPoint = 'center'
): CropArea => {
  const targetRatio = targetWidth / targetHeight;
  const imgRatio = imgWidth / imgHeight;

  let dw, dh;

  // 1. Сначала находим размеры для "cover"
  if (imgRatio > targetRatio) {
    // Картинка шире, чем нужно. Ограничиваем по высоте.
    dh = imgHeight;
    dw = imgHeight * targetRatio;
  } else {
    // Картинка уже, чем нужно. Ограничиваем по ширине.
    dw = imgWidth;
    dh = imgWidth / targetRatio;
  }

  // 2. Применяем зум (уменьшаем область выреза)
  dw /= zoom;
  dh /= zoom;

  // 3. Рассчитываем координаты на основе якоря
  let x, y;

  // Горизонтальное выравнивание
  if (anchor.includes('left')) {
    x = 0;
  } else if (anchor.includes('right')) {
    x = imgWidth - dw;
  } else {
    x = (imgWidth - dw) / 2;
  }

  // Вертикальное выравнивание
  if (anchor.includes('top')) {
    y = 0;
  } else if (anchor.includes('bottom')) {
    y = imgHeight - dh;
  } else {
    y = (imgHeight - dh) / 2;
  }

  return { x, y, width: dw, height: dh };
};

export const getPresetsByCategory = (category: CropPreset['category']) => {
  return ETSY_PRESETS.filter(p => p.category === category);
};

export const cropImage = (
  imageData: string,
  x: number,
  y: number,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  format: ExportFormat = 'png',
  quality: number = 1.0
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Отрисовка с обрезкой и масштабированием до целевого размера
      ctx.drawImage(
        img,
        x,
        y,
        width,
        height,
        0,
        0,
        targetWidth,
        targetHeight
      );
      
      resolve(canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageData;
  });
};

/**
 * Специальная функция для создания плитки 2x2
 */
export const createTiledImage = (
  imageData: string,
  targetWidth: number,
  targetHeight: number,
  format: ExportFormat = 'png',
  quality: number = 1.0
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const w = targetWidth / 2;
      const h = targetHeight / 2;

      // Рисуем 4 копии
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
      ctx.drawImage(img, 0, 0, img.width, img.height, w, 0, w, h);
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, h, w, h);
      ctx.drawImage(img, 0, 0, img.width, img.height, w, h, w, h);

      resolve(canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageData;
  });
};

/**
 * Отрисовывает паттерн внутри 4-х точек (Warp) с режимом наложения Multiply.
 * Использует метод разбиения на треугольники для текстурирования.
 */
export interface Point { x: number; y: number }

export const drawQuadrilateralWarp = (
  ctx: CanvasRenderingContext2D,
  patternImg: HTMLImageElement,
  backgroundImg: HTMLImageElement | null,
  tl: Point, tr: Point, br: Point, bl: Point,
  canvasWidth: number,
  canvasHeight: number
) => {
  // 1. Рисуем фон (интерьер)
  if (backgroundImg) {
    ctx.drawImage(backgroundImg, 0, 0, canvasWidth, canvasHeight);
  }

  // 2. Настраиваем наложение для паттерна (чтобы тени просвечивали)
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  // Временная реализация Warp через треугольники (упрощенная)
  // Для полноценного Warp нужна сложная математика трансформации матриц.
  // Здесь мы используем простое разбиение на 2 треугольника.
  
  // Треугольник 1: TL, TR, BL
  drawTriangle(ctx, patternImg, 
    0, 0, patternImg.width, 0, 0, patternImg.height, // Source coords (full image)
    tl.x, tl.y, tr.x, tr.y, bl.x, bl.y // Dest coords
  );

  // Треугольник 2: TR, BR, BL
  // Здесь есть нюанс: для текстуры мы должны брать координаты, соответствующие
  // правильной проекции. Для простоты берем всю текстуру.
  drawTriangle(ctx, patternImg,
    patternImg.width, 0, patternImg.width, patternImg.height, 0, patternImg.height,
    tr.x, tr.y, br.x, br.y, bl.x, bl.y
  );

  ctx.restore();
};

/**
 * Helper для отрисовки текстурированного треугольника
 * (Affine Transform Hack)
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  ctx.lineTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.closePath();
  ctx.clip();

  // Affine transform calculation
  const denom = x0 * (y2 - y1) - x1 * y2 + x2 * y1 + (x1 - x2) * y0;
  if (denom === 0) {
    ctx.restore();
    return;
  }

  const m11 = -(y0 * (sx2 - sx1) - y1 * sx2 + y2 * sx1 + (y1 - y2) * sx0) / denom;
  const m12 = (y1 * sy2 + y0 * (sy1 - sy2) - y2 * sy1 + (y2 - y1) * sy0) / denom;
  const m21 = (x0 * (sx2 - sx1) - x1 * sx2 + x2 * sx1 + (x1 - x2) * sx0) / denom;
  const m22 = -(x1 * sy2 + x0 * (sy1 - sy2) - x2 * sy1 + (x2 - x1) * sy0) / denom;
  const dx = (x0 * (y2 * sx1 - y1 * sx2) + y0 * (x1 * sx2 - x2 * sx1) + (x2 * y1 - x1 * y2) * sx0) / denom;
  const dy = (x0 * (y2 * sy1 - y1 * sy2) + y0 * (x1 * sy2 - x2 * sy1) + (x2 * y1 - x1 * y2) * sy0) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(im, 0, 0);
  ctx.restore();
}

/**
 * Создает финальное изображение с Warp
 */
export const createWarpedImage = (
  bgImageData: string,
  patternImageData: string,
  points: { tl: Point, tr: Point, br: Point, bl: Point },
  width: number,
  height: number,
  format: ExportFormat = 'png'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    const patImg = new Image();
    patImg.crossOrigin = "anonymous";

    let bgLoaded = false;
    let patLoaded = false;

    const tryRender = () => {
      if (!bgLoaded || !patLoaded) return;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas failed'));

      drawQuadrilateralWarp(
        ctx, patImg, bgImg,
        points.tl, points.tr, points.br, points.bl,
        width, height
      );

      resolve(canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg'));
    };

    bgImg.onload = () => { bgLoaded = true; tryRender(); };
    patImg.onload = () => { patLoaded = true; tryRender(); };
    
    bgImg.src = bgImageData;
    patImg.src = patternImageData;
  });
};

export const downloadCrop = (
  imageData: string,
  filename: string = 'etsy-crop.png'
) => {
  const link = document.createElement('a');
  link.href = imageData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getGroupedPresets = () => {
  return {
    primary: getPresetsByCategory('primary'),
    secondary: getPresetsByCategory('secondary'),
    social: getPresetsByCategory('social'),
  };
};

export const batchCropImages = (
  imageData: string,
  presets: CropPreset[],
  format: ExportFormat = 'png'
): Promise<{ [key: string]: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const results: { [key: string]: string } = {};
      
      const processPreset = async (preset: CropPreset) => {
        if (preset.specialMode === 'tile') {
          results[preset.id] = await createTiledImage(imageData, preset.width, preset.height, format, 1.0);
        } else {
          const area = calculateCropArea(
            img.width,
            img.height,
            preset.width,
            preset.height,
            preset.defaultZoom || 1.0,
            preset.defaultAnchor || 'center'
          );
          results[preset.id] = await cropImage(
            imageData,
            area.x,
            area.y,
            area.width,
            area.height,
            preset.width,
            preset.height,
            format,
            1.0
          );
        }
      };

      Promise.all(presets.map(processPreset))
        .then(() => resolve(results))
        .catch(reject);
    };
    img.onerror = () => reject(new Error('Failed to load image for batch processing'));
    img.src = imageData;
  });
};

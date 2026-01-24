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

export type PerspectiveMode = 'none' | 'left' | 'right' | 'corner-in';

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
  specialMode?: 'tile' | 'perspective';
  perspectiveMode?: PerspectiveMode;
  perspectiveAmount?: number; // 0 to 1
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
  {
    id: 'detail_macro_side',
    name: 'detail_macro_side',
    label: '🔍 Детали (сбоку)',
    description: 'Макро-текстуры боковой части с наклоном (2000x2000)',
    width: 2000,
    height: 2000,
    category: 'primary',
    icon: '🔍',
    defaultZoom: 2.5,
    defaultAnchor: 'center',
    specialMode: 'perspective',
    perspectiveMode: 'right',
    perspectiveAmount: 0.15,
  },

  // 🔍 Дополнительные (Secondary)
  {
    id: 'room_corner_left',
    name: 'room_corner_left',
    label: '🏠 Наклон влево',
    description: 'Реалистичный вид стены под углом влево',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🏠',
    defaultZoom: 1.2,
    defaultAnchor: 'center',
    specialMode: 'perspective',
    perspectiveMode: 'left',
    perspectiveAmount: 0.2,
  },
  {
    id: 'room_corner_right',
    name: 'room_corner_right',
    label: '🏠 Наклон вправо',
    description: 'Реалистичный вид стены под углом вправо',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🏠',
    defaultZoom: 1.2,
    defaultAnchor: 'center',
    specialMode: 'perspective',
    perspectiveMode: 'right',
    perspectiveAmount: 0.2,
  },
  {
    id: 'internal_corner_view',
    name: 'internal_corner_view',
    label: '📐 Угол (стык)',
    description: 'Демонстрация стыковки обоев во внутреннем углу',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '📐',
    defaultZoom: 1.2,
    defaultAnchor: 'center',
    specialMode: 'perspective',
    perspectiveMode: 'corner-in',
    perspectiveAmount: 0.25,
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
 * Отрисовывает изображение с эффектом перспективы или внутреннего угла.
 * Использует метод вертикальных срезов для имитации 3D трансформации.
 */
export const drawPerspective = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
  mode: PerspectiveMode,
  amount: number = 0.2
) => {
  if (mode === 'none') {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }

  ctx.save();
  
  if (mode === 'corner-in') {
    // Режим внутреннего угла: две стены, сходящиеся к центру
    const midX = dx + dw / 2;
    const halfW = dw / 2;
    
    // Левая стена (наклон вправо к центру)
    drawPerspective(ctx, img, sx, sy, sw / 2, sh, dx, dy, halfW, dh, 'right', amount);
    // Правая стена (наклон влево к центру)
    drawPerspective(ctx, img, sx + sw / 2, sy, sw / 2, sh, midX, dy, halfW, dh, 'left', amount);
    
    // Тень в углу для реализма
    const gradient = ctx.createLinearGradient(midX - 50, dy, midX + 50, dy);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, `rgba(0,0,0,${amount * 0.8})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(midX - 50, dy, 100, dh);
    
    ctx.restore();
    return;
  }

  // Отрисовка наклона через вертикальные срезы
  const slices = 120; // Количество срезов для плавности
  const sliceW = dw / slices;
  const sourceSliceW = sw / slices;

  for (let i = 0; i <= slices; i++) {
    const x = dx + i * sliceW;
    const sX = sx + i * sourceSliceW;
    
    // Рассчитываем высоту среза на основе перспективы
    // t идет от 0 до 1
    const t = i / slices;
    let scale;
    
    if (mode === 'left') {
      // Слева выше, справа ниже (наклон от нас вправо)
      scale = 1 - (t * amount);
    } else {
      // Слева ниже, справа выше (наклон от нас влево)
      scale = (1 - amount) + (t * amount);
    }

    const sliceH = dh * scale;
    const yOffset = (dh - sliceH) / 2;

    ctx.drawImage(
      img,
      sX, sy, sourceSliceW, sh,
      x, dy + yOffset, sliceW, sliceH
    );
  }

  // Наложение легкого градиента для имитации освещения
  const lightGrad = ctx.createLinearGradient(dx, dy, dx + dw, dy);
  if (mode === 'left') {
    lightGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
    lightGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  } else {
    lightGrad.addColorStop(0, 'rgba(0,0,0,0.1)');
    lightGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
  }
  ctx.fillStyle = lightGrad;
  ctx.fillRect(dx, dy, dw, dh);

  ctx.restore();
};

/**
 * Создает изображение с перспективой
 */
export const createPerspectiveImage = (
  imageData: string,
  x: number,
  y: number,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  mode: PerspectiveMode,
  amount: number = 0.2,
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

      // Фон (белый или прозрачный)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      drawPerspective(
        ctx, img,
        x, y, width, height,
        0, 0, targetWidth, targetHeight,
        mode, amount
      );

      resolve(canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageData;
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
        } else if (preset.specialMode === 'perspective') {
          const area = calculateCropArea(
            img.width,
            img.height,
            preset.width,
            preset.height,
            preset.defaultZoom || 1.0,
            preset.defaultAnchor || 'center'
          );
          results[preset.id] = await createPerspectiveImage(
            imageData,
            area.x,
            area.y,
            area.width,
            area.height,
            preset.width,
            preset.height,
            preset.perspectiveMode || 'none',
            preset.perspectiveAmount || 0.2,
            format,
            1.0
          );
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

/**
 * Image Crop Service для Etsy
 * Поддерживает стандарты Etsy (3000px+), JPG 92-95%, sRGB.
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
    description: 'Макро-текстуры боковой части (2000x2000)',
    width: 2000,
    height: 2000,
    category: 'primary',
    icon: '🔍',
    defaultZoom: 2.5,
    defaultAnchor: 'right',
  },

  // 🔍 Дополнительные (Secondary)
  {
    id: 'room_corner_left',
    name: 'room_corner_left',
    label: '🏠 Левый угол',
    description: 'Вид на левый стык комнаты',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🏠',
    defaultZoom: 1.5,
    defaultAnchor: 'top-left',
  },
  {
    id: 'room_corner_right',
    name: 'room_corner_right',
    label: '🏠 Правый угол',
    description: 'Вид на правый стык комнаты',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🏠',
    defaultZoom: 1.5,
    defaultAnchor: 'top-right',
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
    description: 'Демонстрация стыковки',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🔄',
    defaultZoom: 1.8,
    defaultAnchor: 'bottom-right',
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
  quality: number = 0.95
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

      // Включаем сглаживание для качественного ресайза
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
      
      // Сохраняем в JPG с заданным качеством
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageData;
  });
};

export const downloadCrop = (
  imageData: string,
  filename: string = 'etsy-crop.jpg'
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
  presets: CropPreset[]
): Promise<{ [key: string]: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const results: { [key: string]: string } = {};
      
      try {
        presets.forEach(preset => {
          const area = calculateCropArea(
            img.width,
            img.height,
            preset.width,
            preset.height,
            preset.defaultZoom || 1.0,
            preset.defaultAnchor || 'center'
          );

          const canvas = document.createElement('canvas');
          canvas.width = preset.width;
          canvas.height = preset.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) return;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Отрисовка с обрезкой
          ctx.drawImage(
            img,
            area.x,
            area.y,
            area.width,
            area.height,
            0,
            0,
            preset.width,
            preset.height
          );
          
          // Сохраняем в JPG 95%
          results[preset.id] = canvas.toDataURL('image/jpeg', 0.95);
        });
        
        resolve(results);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for batch processing'));
    img.src = imageData;
  });
};

/**
 * Image Crop Service для Etsy
 * Поддерживает стандарты Etsy (3000px+), JPG 92-95%, sRGB.
 */

export interface CropPreset {
  id: string;
  name: string;
  label: string;
  description: string;
  width: number;
  height: number;
  category: 'primary' | 'secondary' | 'social';
  icon: string;
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
  },
  {
    id: 'detail_macro',
    name: 'detail_macro',
    label: '🔍 Детали',
    description: 'Макро-текстуры и детализация узора (2000x2000)',
    width: 2000,
    height: 2000,
    category: 'primary',
    icon: '🔍',
  },

  // 🔍 Дополнительные (Secondary)
  {
    id: 'room_corner',
    name: 'room_corner',
    label: '🏠 Угол комнаты',
    description: 'Реалистичный вид на стыке',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🏠',
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
  },
  {
    id: 'color_palette',
    name: 'color_palette',
    label: '🎨 Цветовые варианты',
    description: 'Палитра',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '🎨',
  },
  {
    id: 'packaging',
    name: 'packaging',
    label: '📦 Упаковка',
    description: 'Вид товара перед отправкой',
    width: 2000,
    height: 2000,
    category: 'secondary',
    icon: '📦',
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
  },
];

export const getPresetsByCategory = (category: CropPreset['category']) => {
  return ETSY_PRESETS.filter(p => p.category === category);
};

export const cropImage = (
  imageData: string,
  x: number,
  y: number,
  width: number,
  height: number,
  quality: number = 0.95
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Отрисовка с обрезкой
      ctx.drawImage(
        img,
        x,
        y,
        width,
        height,
        0,
        0,
        width,
        height
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
          const canvas = document.createElement('canvas');
          canvas.width = preset.width;
          canvas.height = preset.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) return;

          // Центрируем кроп по умолчанию
          const maxX = Math.max(0, img.width - preset.width);
          const maxY = Math.max(0, img.height - preset.height);
          const x = Math.floor(maxX / 2);
          const y = Math.floor(maxY / 2);

          // Отрисовка с обрезкой
          ctx.drawImage(
            img,
            x,
            y,
            preset.width,
            preset.height,
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

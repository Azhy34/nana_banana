import React, { useRef, useState, useEffect } from 'react';
import {
  ETSY_PRESETS,
  getPresetsByCategory,
  CropPreset,
  cropImage,
  downloadCrop,
  batchCropImages,
  calculateCropArea,
} from '../services/imageCropService';
import { Step } from '../types';
interface EtsyCropperProps {
  initialImage?: string | null;
  onBack?: () => void;
}

type CategoryType = 'primary' | 'secondary' | 'social';

const CATEGORY_LABELS: { [key in CategoryType]: string } = {
  primary: '⭐ Основные фото',
  secondary: '🔍 Дополнительные',
  social: '📱 Соцсети',
};

const AspectPreview = ({ width, height, active }: { width: number, height: number, active: boolean }) => {
  const ratio = width / height;
  return (
    <div className={`w-12 h-10 flex items-center justify-center bg-slate-950 rounded-md border transition-colors ${active ? 'border-indigo-400' : 'border-slate-700'}`}>
      <div 
        style={{ 
          aspectRatio: `${width}/${height}`,
          width: ratio > 1.2 ? '28px' : (ratio < 0.8 ? '16px' : '22px'),
          height: ratio > 1.2 ? '18px' : (ratio < 0.8 ? '28px' : '22px'),
        }}
        className={`border-[1.5px] transition-colors ${active ? 'border-indigo-500 bg-indigo-500/30' : 'border-slate-500 bg-slate-800'}`}
      />
    </div>
  );
};

export const EtsyCropper: React.FC<EtsyCropperProps> = ({
  initialImage,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [sourceImage, setSourceImage] = useState<string | null>(initialImage || 'https://images.unsplash.com/photo-1540989100695-9b8763814c8f?q=80&w=3000&auto=format&fit=crop');
  const [selectedPreset, setSelectedPreset] = useState<CropPreset>(ETSY_PRESETS[0]);
  const [zoom, setZoom] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [crops, setCrops] = useState<{ [key: string]: string }>({});
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(
    new Set(ETSY_PRESETS.map(p => p.id))
  );
  const [activeCategory, setActiveCategory] = useState<CategoryType>('primary');
  const [showBatchMode, setShowBatchMode] = useState(false);

  // Загрузка изображения или смена пресета
  useEffect(() => {
    if (sourceImage && imgRef.current) {
      const img = imgRef.current;
      const area = calculateCropArea(
        img.width,
        img.height,
        selectedPreset.width,
        selectedPreset.height,
        selectedPreset.defaultZoom || 1.0,
        selectedPreset.defaultAnchor || 'center'
      );
      setOffsetX(area.x);
      setOffsetY(area.y);
      setZoom(selectedPreset.defaultZoom || 1.0);
    } else if (sourceImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imgRef.current = img;
        const area = calculateCropArea(
          img.width,
          img.height,
          selectedPreset.width,
          selectedPreset.height,
          selectedPreset.defaultZoom || 1.0,
          selectedPreset.defaultAnchor || 'center'
        );
        setOffsetX(area.x);
        setOffsetY(area.y);
        setZoom(selectedPreset.defaultZoom || 1.0);
        drawPreview();
      };
      img.src = sourceImage;
    }
  }, [sourceImage, selectedPreset.id]);

  // Перерисовка при изменении параметров
  useEffect(() => {
    drawPreview();
  }, [selectedPreset, offsetX, offsetY, zoom, sourceImage]);

  const drawPreview = () => {
    if (!canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    const containerWidth = containerRef.current?.clientWidth || 800;
    const scale = containerWidth / img.width;

    canvas.width = containerWidth;
    canvas.height = img.height * scale;

    // Отрисовка основного изображения
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Рассчитываем размеры области выреза на основе текущего пресета и зума
    const targetRatio = selectedPreset.width / selectedPreset.height;
    const imgRatio = img.width / img.height;

    let dw, dh;
    if (imgRatio > targetRatio) {
      dh = img.height;
      dw = img.height * targetRatio;
    } else {
      dw = img.width;
      dh = img.width / targetRatio;
    }

    dw /= zoom;
    dh /= zoom;

    // Отрисовка crop области
    const cropX = offsetX * scale;
    const cropY = offsetY * scale;
    const cropWidth = dw * scale;
    const cropHeight = dh * scale;

    // Полутемная область снаружи crop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Очистить область crop (через clip или просто отрисовку поверх)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cropX, cropY, cropWidth, cropHeight);
    ctx.clip();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Граница crop
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);
    
    // Метки размеров
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(
      `${selectedPreset.width}x${selectedPreset.height}px`,
      cropX + 10,
      cropY + 25
    );
  };

  const handleCanvasInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const img = imgRef.current;
    const scale = canvas.width / img.width;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Рассчитываем текущие размеры рамки (dw, dh) для правильного позиционирования
    const targetRatio = selectedPreset.width / selectedPreset.height;
    const imgRatio = img.width / img.height;
    let dw, dh;
    if (imgRatio > targetRatio) {
      dh = img.height;
      dw = img.height * targetRatio;
    } else {
      dw = img.width;
      dh = img.width / targetRatio;
    }
    dw /= zoom;
    dh /= zoom;

    // Вычисляем координаты относительно центра кропа
    const x = Math.floor((clientX - rect.left) / scale - dw / 2);
    const y = Math.floor((clientY - rect.top) / scale - dh / 2);

    const maxX = Math.max(0, img.width - dw);
    const maxY = Math.max(0, img.height - dh);

    setOffsetX(Math.max(0, Math.min(x, maxX)));
    setOffsetY(Math.max(0, Math.min(y, maxY)));
  };

  const handleApplyCrop = async () => {
    if (!sourceImage || !imgRef.current) return;
    setIsProcessing(true);

    const img = imgRef.current;
    const targetRatio = selectedPreset.width / selectedPreset.height;
    const imgRatio = img.width / img.height;
    let dw, dh;
    if (imgRatio > targetRatio) {
      dh = img.height;
      dw = img.height * targetRatio;
    } else {
      dw = img.width;
      dh = img.width / targetRatio;
    }
    dw /= zoom;
    dh /= zoom;

    try {
      const croppedImage = await cropImage(
        sourceImage,
        offsetX,
        offsetY,
        dw,
        dh,
        selectedPreset.width,
        selectedPreset.height
      );

      setCrops(prev => ({
        ...prev,
        [selectedPreset.id]: croppedImage,
      }));
    } catch (error) {
      console.error('Crop failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateBatchCrops = async () => {
    if (!sourceImage) return;
    setIsProcessing(true);
    const selectedPresets = ETSY_PRESETS.filter(p => selectedForBatch.has(p.id));

    try {
      const newCrops = await batchCropImages(sourceImage, selectedPresets);
      setCrops(prev => ({ ...prev, ...newCrops }));
      setShowBatchMode(false);
    } catch (error) {
      console.error('Batch crop failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSourceImage(e.target?.result as string);
        setCrops({}); // Сброс старых кропов при новом фото
      };
      reader.readAsDataURL(file);
    }
  };

  if (!sourceImage) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Загрузите фото для Etsy</h2>
          <p className="text-slate-400">Мы нарежем его под все необходимые форматы (3000px+)</p>
        </div>
        
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-700 rounded-3xl cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 hover:border-indigo-500/50 transition-all group">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
            </div>
            <p className="mb-2 text-lg font-semibold text-white">Кликните или перетащите файл</p>
            <p className="text-sm text-slate-500">PNG, JPG или WebP (макс. 50MB)</p>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
        </label>

        {onBack && (
          <button 
            onClick={onBack}
            className="mt-8 w-full py-4 bg-slate-800 text-slate-300 rounded-2xl hover:bg-slate-700 transition-all font-medium border border-slate-700"
          >
            ← Вернуться к генератору
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Etsy Image Cropper</h2>
          <p className="text-sm text-slate-400">Подготовка листинга по стандартам Etsy</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setSourceImage(null)}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Заменить фото
          </button>
          {onBack && (
            <button 
              onClick={onBack}
              className="px-4 py-2 bg-indigo-600/20 text-indigo-300 rounded-lg hover:bg-indigo-600/30 transition-colors"
            >
              Вернуться
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700">
        <button
          onClick={() => setShowBatchMode(false)}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
            !showBatchMode
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ✏️ Ручной режим
        </button>
        <button
          onClick={() => setShowBatchMode(true)}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
            showBatchMode
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚡ Batch Mode
        </button>
      </div>

      {!showBatchMode ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-4">
              <div
                ref={containerRef}
                className="relative w-full bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl"
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={() => setIsDragging(true)}
                  onMouseMove={handleCanvasInteraction}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  onTouchStart={() => setIsDragging(true)}
                  onTouchMove={handleCanvasInteraction}
                  onTouchEnd={() => setIsDragging(false)}
                  className="w-full cursor-move touch-none"
                />
              </div>

              {/* Zoom Control */}
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                <span className="text-sm font-medium text-slate-400 min-w-[3rem]">Zoom</span>
                <input 
                  type="range" 
                  min="1" 
                  max="4" 
                  step="0.05" 
                  value={zoom}
                  onChange={(e) => {
                    const newZoom = parseFloat(e.target.value);
                    setZoom(newZoom);
                    
                    // Корректируем смещение при зуме, чтобы рамка не выходила за края
                    if (imgRef.current) {
                      const img = imgRef.current;
                      const targetRatio = selectedPreset.width / selectedPreset.height;
                      const imgRatio = img.width / img.height;
                      let dw, dh;
                      if (imgRatio > targetRatio) {
                        dh = img.height; dw = img.height * targetRatio;
                      } else {
                        dw = img.width; dh = img.width / targetRatio;
                      }
                      dw /= newZoom; dh /= newZoom;
                      
                      const maxX = Math.max(0, img.width - dw);
                      const maxY = Math.max(0, img.height - dh);
                      setOffsetX(prev => Math.max(0, Math.min(prev, maxX)));
                      setOffsetY(prev => Math.max(0, Math.min(prev, maxY)));
                    }
                  }}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-sm font-bold text-indigo-400 min-w-[2.5rem]">{zoom.toFixed(2)}x</span>
              </div>
            </div>
            
            <button
              onClick={handleApplyCrop}
              disabled={isProcessing}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-xl shadow-indigo-500/20"
            >
              {isProcessing ? '⏳ Обработка...' : `✂️ Сохранить ${selectedPreset.label}`}
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    setActiveCategory(category);
                    const presets = getPresetsByCategory(category);
                    if (presets.length > 0) setSelectedPreset(presets[0]);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeCategory === category
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>

            <div className="grid gap-2">
              {getPresetsByCategory(activeCategory).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`p-2.5 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${
                    selectedPreset.id === preset.id
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <AspectPreview width={preset.width} height={preset.height} active={selectedPreset.id === preset.id} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white leading-tight text-sm truncate">{preset.label}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      {preset.width} × {preset.height}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map((category) => (
              <div key={category} className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-2">
                  {getPresetsByCategory(category).map((preset) => (
                    <label key={preset.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedForBatch.has(preset.id)}
                        onChange={() => {
                          const next = new Set(selectedForBatch);
                          if (next.has(preset.id)) next.delete(preset.id);
                          else next.add(preset.id);
                          setSelectedForBatch(next);
                        }}
                        className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-slate-200">{preset.label}</div>
                        <div className="text-xs text-slate-500">{preset.width}x{preset.height}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleGenerateBatchCrops}
            disabled={isProcessing || selectedForBatch.size === 0}
            className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-2xl shadow-2xl shadow-indigo-500/20 disabled:opacity-50"
          >
            {isProcessing ? '⏳ Обработка...' : `⚡ Создать все выбранные (${selectedForBatch.size})`}
          </button>
        </div>
      )}

      {Object.keys(crops).length > 0 && (
        <div className="pt-8 border-t border-slate-800 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">Готовые форматы ({Object.keys(crops).length})</h3>
            <button onClick={() => setCrops({})} className="text-sm text-slate-500 hover:text-slate-300">Очистить все</button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {ETSY_PRESETS.filter(p => crops[p.id]).map((preset) => (
              <div key={preset.id} className="group space-y-2">
                <div className="aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden border border-slate-700 relative">
                  <img src={crops[preset.id]} className="w-full h-full object-cover shadow-inner" alt={preset.label} />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => downloadCrop(crops[preset.id], `etsy-${preset.id}.jpg`)}
                      className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform"
                    >
                      📥
                    </button>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-400 text-center truncate">{preset.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useRef } from 'react';
import { UploadedImage } from '../types';

interface ImageUploaderProps {
  onUpload: (file: File) => Promise<void>;
  uploadedImages: UploadedImage[];
  onRemove: (id: string) => void;
  title: string;
  description: string;
  multiple?: boolean;
  maxImages?: number;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUpload,
  uploadedImages,
  onRemove,
  title,
  description,
  multiple = false,
  maxImages = 1
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      for (const file of files) {
         await onUpload(file);
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canAddMore = multiple ? (maxImages ? uploadedImages.length < maxImages : true) : uploadedImages.length === 0;

  return (
    <div className="w-full bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-slate-400 text-sm mt-1">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {uploadedImages.map((img) => (
          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
            <img src={img.previewUrl} alt="Uploaded" className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(img.id)}
              className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        ))}
        
        {canAddMore && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-slate-600 hover:border-indigo-500 bg-slate-800/30 hover:bg-slate-800/80 transition-all group"
          >
            <div className="p-3 rounded-full bg-slate-700 group-hover:bg-indigo-500/20 text-slate-400 group-hover:text-indigo-400 transition-colors mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            </div>
            <span className="text-sm text-slate-400 group-hover:text-slate-200 font-medium">Add Image</span>
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/webp"
        multiple={multiple}
        className="hidden"
      />
    </div>
  );
};

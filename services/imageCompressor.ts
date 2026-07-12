/**
 * Client-side image compressor using HTML5 Canvas.
 * Rescales images so that the maximum dimension does not exceed 2048px.
 * Compresses the image to JPEG at 90% quality to avoid 30MB API payload errors.
 */
export function compressImageFile(file: File): Promise<{ dataUrl: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          const maxSide = 2048;

          // Downscale if image is too large
          if (width > maxSide || height > maxSide) {
            if (width > height) {
              height = Math.round((height * maxSide) / width);
              width = maxSide;
            } else {
              width = Math.round((width * maxSide) / height);
              height = maxSide;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context is not available');
          }

          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
          const base64 = compressedDataUrl.split(',')[1];
          
          resolve({ dataUrl: compressedDataUrl, base64 });
        } catch (err) {
          // Fallback to original image if canvas fails
          const rawDataUrl = e.target?.result as string;
          resolve({ dataUrl: rawDataUrl, base64: rawDataUrl.split(',')[1] });
        }
      };
      img.onerror = () => {
        const rawDataUrl = e.target?.result as string;
        resolve({ dataUrl: rawDataUrl, base64: rawDataUrl.split(',')[1] });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

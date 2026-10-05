'use client';

/**
 * Genera los 3 tamaños en el navegador antes de subir (Fase 7):
 * original (máx 4096px), mediana (1024px) y miniatura (256px).
 * Todo se normaliza a JPEG con fondo blanco (fotos familiares).
 */

const MAX_ORIGINAL = 4096;
const MAX_MEDIUM = 1024;
const SIZE_THUMB = 256;
const QUALITY = 0.85;

function drawToBlob(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: w, height: h }) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      QUALITY,
    );
  });
}

/**
 * @param {File} file imagen elegida por el familiar
 * @returns {Promise<{ original: Blob, medium: Blob, thumb: Blob, width: number, height: number, size_bytes: number }>}
 */
export async function fileToSizedBlobs(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Elige una foto JPG, PNG o WebP.');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('La foto supera 15 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const [original, medium, thumb] = await Promise.all([
      drawToBlob(bitmap, MAX_ORIGINAL),
      drawToBlob(bitmap, MAX_MEDIUM),
      drawToBlob(bitmap, SIZE_THUMB),
    ]);
    return {
      original: original.blob, medium: medium.blob, thumb: thumb.blob,
      width: bitmap.width, height: bitmap.height, size_bytes: original.blob.size,
    };
  } finally {
    bitmap.close?.();
  }
}

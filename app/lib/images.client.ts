/** Names and types of files can be anything. */
export async function detectImageType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return null;
}

/** The picture as it is shown, turned as its metadata says and with a limited long side. */
export async function drawImage(file: File, maxPixels: number, background?: string) {
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxPixels / Math.max(image.width, image.height));
  const canvas = createCanvas(image.width * scale, image.height * scale);
  const context = canvas.getContext('2d')!;
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas;
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Null if the browser cannot do it, e.g. because the canvas is too large. */
export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

const LOGO_PIXELS = 2000;

/** A logo without metadata. The server only takes pictures that are nothing else. */
export async function drawLogo(file: File) {
  const type = await detectImageType(file);
  if (!type) return null;
  const blob = await toBlob(await drawImage(file, LOGO_PIXELS), type, 0.92);
  return blob && new File([blob], file.name, { type });
}

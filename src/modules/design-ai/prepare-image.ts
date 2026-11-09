import type {
  RoomImageMimeType,
  RoomImageUpload,
} from "../../shared/kit-design";

/** Largest stored room image. Small enough for direct upload and AI vision input. */
export const MAX_IMAGE_BYTES = 1_000_000;
/** Largest file accepted before shrinking (phone photos are usually 2–8 MB). */
export const MAX_IMAGE_INPUT_BYTES = 25_000_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const SIDES = [2048, 1600, 1280];
const QUALITIES = [0.85, 0.7, 0.55];

export const isRoomImageType = (type: string): type is RoomImageMimeType =>
  (IMAGE_TYPES as readonly string[]).includes(type);

/** Scales (width, height) so the longest side is at most maxSide, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Tries each size and quality in order and returns the first encoding that fits. */
export async function pickEncoding<T extends { size: number }>(
  sides: number[],
  qualities: number[],
  encode: (side: number, quality: number) => Promise<T>,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<T> {
  for (const side of sides)
    for (const quality of qualities) {
      const result = await encode(side, quality);
      if (result.size <= maxBytes) return result;
    }
  throw new Error("No se pudo reducir la imagen a 1 MB.");
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

async function decode(file: File): Promise<
  CanvasImageSource & {
    width: number;
    height: number;
  }
> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Fall back to an <img> element below. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("La imagen no es válida."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodeJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen.");
  // Plans with transparency would turn black as JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No se pudo procesar la imagen.")),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Validates a room photo or floor plan and returns it ready to store.
 * Images over 1 MB or longer than 2048 px are shrunk to a JPEG that fits.
 */
export async function prepareRoomImage(file: File): Promise<RoomImageUpload> {
  if (!isRoomImageType(file.type))
    throw new Error("Usa una imagen PNG, JPEG o WebP del salón.");
  if (file.size > MAX_IMAGE_INPUT_BYTES)
    throw new Error("Cada imagen debe pesar 25 MB o menos.");
  const image = await decode(file);
  const intrinsic = { width: image.width, height: image.height };
  if (!intrinsic.width || !intrinsic.height)
    throw new Error("La imagen no es válida.");
  let blob: Blob = file;
  let mimeType: RoomImageMimeType = file.type;
  let size = intrinsic;
  if (
    file.size > MAX_IMAGE_BYTES ||
    Math.max(size.width, size.height) > SIDES[0]
  ) {
    const encoded = await pickEncoding(
      SIDES,
      QUALITIES,
      async (side, quality) => {
        const fitted = fitWithin(intrinsic.width, intrinsic.height, side);
        const result = await encodeJpeg(
          image,
          fitted.width,
          fitted.height,
          quality,
        );
        return { size: result.size, blob: result, fitted };
      },
    );
    blob = encoded.blob;
    mimeType = "image/jpeg";
    size = encoded.fitted;
  }
  if ("close" in image && typeof image.close === "function") image.close();
  return {
    name: file.name,
    mimeType,
    dataUrl: await readDataUrl(blob),
    width: size.width,
    height: size.height,
  };
}

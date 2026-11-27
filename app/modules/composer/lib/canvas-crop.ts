import { avatarLimits } from "../../avatars/index.ts";

const HALF = 2;
const ORIGIN = 0;

async function decoded(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

function drawnSquare(image: ImageBitmap): OffscreenCanvas | null {
  const { side } = avatarLimits;
  const square = Math.min(image.width, image.height);
  const canvas = new OffscreenCanvas(side, side);
  const context = canvas.getContext("2d");
  if (context === null) {
    return null;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (image.width - square) / HALF,
    (image.height - square) / HALF,
    square,
    square,
    ORIGIN,
    ORIGIN,
    side,
    side,
  );
  return canvas;
}

async function canvasAvatarCrop(file: Blob): Promise<Uint8Array | null> {
  const image = await decoded(file);
  if (image === null) {
    return null;
  }
  const canvas = drawnSquare(image);
  image.close();
  if (canvas === null) {
    return null;
  }
  const png = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await png.arrayBuffer());
}

export { canvasAvatarCrop };

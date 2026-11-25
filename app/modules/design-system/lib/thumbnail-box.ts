import type { AttachmentImageParts, ImageBox } from "./attachment-parts.ts";

const THUMBNAIL: ImageBox = { height: 200, width: 300 };
const SMALL: ImageBox = { height: 48, width: 72 };
const WHOLE = 1;

function boxOf(small: boolean): ImageBox {
  if (small) {
    return SMALL;
  }
  return THUMBNAIL;
}

function fitted(size: ImageBox | null, small: boolean): ImageBox {
  const box = boxOf(small);
  if (size === null) {
    return box;
  }
  const scale = Math.min(WHOLE, box.width / size.width, box.height / size.height);
  return { height: Math.round(size.height * scale), width: Math.round(size.width * scale) };
}

type Fitting = Pick<AttachmentImageParts, "size" | "small">;

function pixels({ size, small }: Fitting): { readonly width: string; readonly height: string } {
  const { height, width } = fitted(size, small);
  return { height: `${String(height)}px`, width: `${String(width)}px` };
}

export { pixels };

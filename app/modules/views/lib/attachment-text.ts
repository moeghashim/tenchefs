import type { ImageBox, ImageThumbnailParts } from "../../design-system/messages.tsx";
import type { Attachment } from "../../sdk/index.ts";

const KILOBYTE = 1000;
const MEGABYTE = 1_000_000;
const ONE_DECIMAL_BELOW = 10;
const NO_DECIMALS = 0;
const ONE_DECIMAL = 1;

function inUnit(bytes: number, unit: number, label: string): string {
  const value = bytes / unit;
  if (value < ONE_DECIMAL_BELOW) {
    return `${value.toFixed(ONE_DECIMAL)} ${label}`;
  }
  return `${value.toFixed(NO_DECIMALS)} ${label}`;
}

function readableSize(bytes: number): string {
  if (bytes < KILOBYTE) {
    return `${String(bytes)} B`;
  }
  if (bytes < MEGABYTE) {
    return inUnit(bytes, KILOBYTE, "KB");
  }
  return inUnit(bytes, MEGABYTE, "MB");
}

function assetUrl(attachment: Attachment): string {
  return `/v1/assets/${encodeURIComponent(attachment.id)}`;
}

function imageBoxOf(attachment: Attachment): ImageBox | null {
  const { height, width } = attachment;
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }
  return { height, width };
}

function shownImageOf(attachment: Attachment): ImageThumbnailParts {
  return {
    detail: readableSize(attachment.size),
    name: attachment.name,
    size: imageBoxOf(attachment),
    src: assetUrl(attachment),
  };
}

function imagesOf(attachments: readonly Attachment[]): readonly Attachment[] {
  return attachments.filter((attachment) => attachment.image);
}

export { assetUrl, imageBoxOf, imagesOf, readableSize, shownImageOf };

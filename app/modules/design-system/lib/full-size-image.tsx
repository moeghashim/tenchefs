import type { ImageParts } from "./attachment-parts.ts";
import type { ReactNode } from "react";

const SHOWN =
  "h-auto max-h-[calc(100vh-6rem)] w-auto max-w-[calc(100vw-2rem)] rounded-md bg-background object-contain shadow-lg";

export function FullSizeImage(parts: ImageParts): ReactNode {
  if (parts.size === null) {
    return <img alt={parts.name} className={SHOWN} src={parts.src} />;
  }
  return <img alt={parts.name} className={SHOWN} height={parts.size.height} src={parts.src} width={parts.size.width} />;
}

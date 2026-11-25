import { ImageFigure } from "./image-figure.tsx";
import type { ImageThumbnailParts } from "./attachment-parts.ts";
import { ImageViewerOverlay } from "./image-viewer-overlay.tsx";
import { Portal } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function ImageViewer(parts: ImageThumbnailParts): ReactNode {
  return (
    <Portal>
      <ImageViewerOverlay />
      <ImageFigure detail={parts.detail} name={parts.name} size={parts.size} src={parts.src} />
    </Portal>
  );
}

import { ImageFigure } from "./image-figure.tsx";
import { ImageViewerOverlay } from "./image-viewer-overlay.tsx";
import { Portal } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import type { ShownImageParts } from "./attachment-parts.ts";

export function ImageViewer(parts: ShownImageParts): ReactNode {
  const { onClosed, onNext, onPrevious } = parts;
  return (
    <Portal>
      <ImageViewerOverlay />
      <ImageFigure
        at={parts.at}
        count={parts.count}
        image={parts.image}
        onClosed={onClosed}
        onNext={onNext}
        onPrevious={onPrevious}
      />
    </Portal>
  );
}

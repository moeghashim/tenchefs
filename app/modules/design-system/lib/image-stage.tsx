import { FullSizeImage } from "./full-size-image.tsx";
import type { ImageStageParts } from "./attachment-parts.ts";
import { ImageStepButtons } from "./image-step-buttons.tsx";
import type { ReactNode } from "react";

export function ImageStage(parts: ImageStageParts): ReactNode {
  const { image, onNext, onPrevious } = parts;
  return (
    <div className="relative">
      <FullSizeImage name={image.name} size={image.size} src={image.src} />
      <ImageStepButtons at={parts.at} count={parts.count} onNext={onNext} onPrevious={onPrevious} />
    </div>
  );
}

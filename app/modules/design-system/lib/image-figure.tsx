import { Content } from "@radix-ui/react-dialog";
import { ImageCaption } from "./image-caption.tsx";
import { ImageStage } from "./image-stage.tsx";
import type { ReactNode } from "react";
import type { ShownImageParts } from "./attachment-parts.ts";

export function ImageFigure(parts: ShownImageParts): ReactNode {
  const { image, onClosed, onNext, onPrevious } = parts;
  return (
    <Content asChild onCloseAutoFocus={onClosed}>
      <figure
        className="fixed top-1/2 left-1/2 z-50 grid -translate-1/2 justify-items-center gap-2 outline-none"
        data-image-viewer=""
      >
        <ImageStage at={parts.at} count={parts.count} image={image} onNext={onNext} onPrevious={onPrevious} />
        <ImageCaption at={parts.at} count={parts.count} detail={image.detail} name={image.name} />
      </figure>
    </Content>
  );
}

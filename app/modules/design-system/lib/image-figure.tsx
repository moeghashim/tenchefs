import { Content } from "@radix-ui/react-dialog";
import { FullSizeImage } from "./full-size-image.tsx";
import { ImageCaption } from "./image-caption.tsx";
import type { ImageThumbnailParts } from "./attachment-parts.ts";
import type { ReactNode } from "react";

export function ImageFigure(parts: ImageThumbnailParts): ReactNode {
  return (
    <Content asChild>
      <figure className="fixed top-1/2 left-1/2 z-50 grid -translate-1/2 justify-items-center gap-2 outline-none">
        <FullSizeImage name={parts.name} size={parts.size} src={parts.src} />
        <ImageCaption detail={parts.detail} name={parts.name} />
      </figure>
    </Content>
  );
}

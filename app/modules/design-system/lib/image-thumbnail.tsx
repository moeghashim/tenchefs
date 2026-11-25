import type { ImageThumbnailParts } from "./attachment-parts.ts";
import { ImageViewer } from "./image-viewer.tsx";
import type { ReactNode } from "react";
import { Root } from "@radix-ui/react-dialog";
import { ThumbnailButton } from "./thumbnail-button.tsx";

export function ImageThumbnail(parts: ImageThumbnailParts): ReactNode {
  return (
    <Root>
      <ThumbnailButton name={parts.name} size={parts.size} src={parts.src} />
      <ImageViewer detail={parts.detail} name={parts.name} size={parts.size} src={parts.src} />
    </Root>
  );
}

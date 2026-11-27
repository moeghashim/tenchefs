import { AttachmentImage } from "./attachment-image.tsx";
import type { ReactNode } from "react";
import type { ThumbnailParts } from "./attachment-parts.ts";
import { useThumbnail } from "./use-thumbnail.ts";

export function ImageThumbnail(parts: ThumbnailParts): ReactNode {
  const { button, onOpen } = useThumbnail(parts.at);
  return (
    <button
      aria-haspopup="dialog"
      className="block cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={onOpen}
      ref={button}
      type="button"
    >
      <AttachmentImage name={parts.name} size={parts.size} small={false} src={parts.src} />
    </button>
  );
}

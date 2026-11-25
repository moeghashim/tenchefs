import { AttachmentImage } from "./attachment-image.tsx";
import type { ImageParts } from "./attachment-parts.ts";
import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dialog";

export function ThumbnailButton(parts: ImageParts): ReactNode {
  return (
    <Trigger asChild>
      <button
        className="block cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        type="button"
      >
        <AttachmentImage name={parts.name} size={parts.size} small={false} src={parts.src} />
      </button>
    </Trigger>
  );
}

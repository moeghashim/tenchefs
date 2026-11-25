import { Close, Overlay } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function ImageViewerOverlay(): ReactNode {
  return (
    <Close asChild>
      <Overlay asChild>
        <div className="fixed inset-0 z-50 cursor-zoom-out bg-black/60" />
      </Overlay>
    </Close>
  );
}

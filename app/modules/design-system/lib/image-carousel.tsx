import type { ImageCarouselParts, ImageThumbnailParts } from "./attachment-parts.ts";
import { ImageCarouselContext } from "./image-carousel-parts.ts";
import { ImageViewer } from "./image-viewer.tsx";
import type { ReactNode } from "react";
import { Root } from "@radix-ui/react-dialog";
import { useImageCarousel } from "./use-image-carousel.ts";

function shownOf(images: readonly ImageThumbnailParts[], at: number): ImageThumbnailParts | null {
  return images.find((_image, index) => index === at) ?? null;
}

export function ImageCarousel(parts: ImageCarouselParts): ReactNode {
  const { images } = parts;
  const { at, control, onClosed, onNext, onOpenChange, onPrevious, open } = useImageCarousel(images.length);
  const image = shownOf(images, at);
  return (
    <ImageCarouselContext value={control}>
      <Root onOpenChange={onOpenChange} open={open}>
        {parts.children}
        {image !== null && (
          <ImageViewer
            at={at}
            count={images.length}
            image={image}
            onClosed={onClosed}
            onNext={onNext}
            onPrevious={onPrevious}
          />
        )}
      </Root>
    </ImageCarouselContext>
  );
}

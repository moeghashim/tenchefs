import { createContext } from "react";

interface ImageCarouselControl {
  readonly open: (at: number) => void;
  readonly register: (at: number, focus: () => void) => () => void;
}

const ImageCarouselContext = createContext<ImageCarouselControl | null>(null);

function carouselOf(control: ImageCarouselControl | null): ImageCarouselControl {
  if (control === null) {
    throw new Error("An ImageThumbnail is drawn only inside an ImageCarousel.");
  }
  return control;
}

export { ImageCarouselContext, carouselOf };
export type { ImageCarouselControl };

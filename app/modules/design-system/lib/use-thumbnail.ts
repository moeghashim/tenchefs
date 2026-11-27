import { ImageCarouselContext, carouselOf } from "./image-carousel-parts.ts";
import { useCallback, useContext, useEffect, useRef } from "react";
import type { RefObject } from "react";

interface Thumbnail {
  readonly button: RefObject<HTMLButtonElement | null>;
  readonly onOpen: () => void;
}

function useThumbnail(at: number): Thumbnail {
  const carousel = carouselOf(useContext(ImageCarouselContext));
  const button = useRef<HTMLButtonElement>(null);
  useEffect(
    () =>
      carousel.register(at, () => {
        if (button.current !== null) {
          button.current.focus();
        }
      }),
    [at, carousel],
  );
  const onOpen = useCallback(() => {
    carousel.open(at);
  }, [at, carousel]);
  return { button, onOpen };
}

export { useThumbnail };

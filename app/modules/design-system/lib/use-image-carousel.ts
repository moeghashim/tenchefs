import { useCallback, useMemo, useState } from "react";
import type { ImageCarouselControl } from "./image-carousel-parts.ts";

const FIRST = 0;
const STEP = 1;

interface Shown {
  readonly at: number;
  readonly open: boolean;
}

interface ImageCarousel {
  readonly at: number;
  readonly open: boolean;
  readonly control: ImageCarouselControl;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onClosed: (event: Readonly<Event>) => void;
}

type Focusers = Map<number, () => void>;

function controlOf(focusers: Focusers, show: (at: number) => void): ImageCarouselControl {
  return {
    open: show,
    register: (at: number, focus: () => void): (() => void) => {
      focusers.set(at, focus);
      return (): void => {
        if (focusers.get(at) === focus) {
          focusers.delete(at);
        }
      };
    },
  };
}

function useImageCarousel(count: number): ImageCarousel {
  const [shown, setShown] = useState<Shown>({ at: FIRST, open: false });
  const focusers = useMemo<Focusers>(() => new Map(), []);
  const control = useMemo(
    () =>
      controlOf(focusers, (at) => {
        setShown({ at, open: true });
      }),
    [focusers],
  );
  const onOpenChange = useCallback((open: boolean) => {
    setShown((was) => ({ at: was.at, open }));
  }, []);
  const onPrevious = useCallback(() => {
    setShown((was) => ({ at: Math.max(was.at - STEP, FIRST), open: was.open }));
  }, []);
  const onNext = useCallback(() => {
    setShown((was) => ({ at: Math.min(was.at + STEP, count - STEP), open: was.open }));
  }, [count]);
  const onClosed = useCallback(
    (event: Readonly<Event>) => {
      event.preventDefault();
      const focus = focusers.get(shown.at);
      if (typeof focus === "function") {
        focus();
      }
    },
    [focusers, shown.at],
  );
  return { at: shown.at, control, onClosed, onNext, onOpenChange, onPrevious, open: shown.open };
}

export { useImageCarousel };

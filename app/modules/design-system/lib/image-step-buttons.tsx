import { ImageStepButton } from "./image-step-button.tsx";
import type { ImageSteps } from "./attachment-parts.ts";
import { MessageKeys } from "./message-keys-parts.ts";
import type { ReactNode } from "react";
import { useContext } from "react";

const TEXT = { next: "Next image", previous: "Previous image" } as const;
const FIRST = 0;
const STEP = 1;

export function ImageStepButtons(parts: ImageSteps): ReactNode {
  const shortcuts = useContext(MessageKeys);
  const { onNext, onPrevious } = parts;
  return (
    <>
      {parts.at > FIRST && (
        <ImageStepButton
          keys={shortcuts.previousImage.keys}
          label={TEXT.previous}
          onClick={onPrevious}
          side="previous"
        />
      )}
      {parts.at < parts.count - STEP && (
        <ImageStepButton keys={shortcuts.nextImage.keys} label={TEXT.next} onClick={onNext} side="next" />
      )}
    </>
  );
}

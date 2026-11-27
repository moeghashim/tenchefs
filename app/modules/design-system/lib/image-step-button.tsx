import type { ReactNode } from "react";

type Side = "previous" | "next";

interface ImageStepButtonParts {
  readonly side: Side;
  readonly label: string;
  readonly keys: string;
  readonly onClick: () => void;
}

const SHAPE =
  "absolute top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background focus-visible:outline-2 focus-visible:outline-ring";

function placeOf(side: Side): string {
  if (side === "previous") {
    return `${SHAPE} left-2`;
  }
  return `${SHAPE} right-2`;
}

function arrowOf(side: Side): string {
  if (side === "previous") {
    return "M10 4l-4 4 4 4";
  }
  return "M6 4l4 4-4 4";
}

export function ImageStepButton(parts: ImageStepButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-keyshortcuts={parts.keys}
      aria-label={parts.label}
      className={placeOf(parts.side)}
      onClick={onClick}
      title={parts.label}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 16 16"
      >
        <path d={arrowOf(parts.side)} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

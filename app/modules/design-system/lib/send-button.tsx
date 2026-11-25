import { BOX_BUTTON } from "./box-button-style.ts";
import type { ReactNode } from "react";

interface SendButtonParts {
  readonly label: string;
  readonly disabled: boolean;
}

export function SendButton(parts: SendButtonParts): ReactNode {
  return (
    <button
      aria-label={parts.label}
      className={`${BOX_BUTTON} bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50`}
      disabled={parts.disabled}
      title={parts.label}
      type="submit"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        viewBox="0 0 16 16"
      >
        <path d="M14 2L7 9M14 2l-4.5 12L7 9 2 6.5 14 2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

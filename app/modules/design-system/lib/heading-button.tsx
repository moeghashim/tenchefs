import { PlusIcon } from "./plus-icon.tsx";
import type { ReactNode } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";

interface HeadingButtonParts {
  readonly label: string;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly onClick: () => void;
}

export function HeadingButton(parts: HeadingButtonParts): ReactNode {
  const { onClick } = parts;
  const button = useFocusOnOpen<HTMLButtonElement>(parts.focused);
  return (
    <button
      aria-expanded={parts.expanded}
      aria-label={parts.label}
      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground"
      onClick={onClick}
      ref={button}
      title={parts.label}
      type="button"
    >
      <PlusIcon />
    </button>
  );
}

import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";

interface HoverButtonParts extends ButtonParts {
  readonly name: string;
  readonly keys?: string;
}

export function HoverButton(parts: HoverButtonParts): ReactNode {
  const handleClick = parts.onClick;
  return (
    <button
      aria-keyshortcuts={parts.keys}
      aria-label={parts.name}
      className="block rounded-md border bg-background px-1.5 py-0.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground"
      onClick={handleClick}
      title={parts.name}
      type="button"
    >
      {parts.children}
    </button>
  );
}

import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";

export function DividerButton(parts: ButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <div className="my-2 flex items-center gap-3 px-5">
      <button
        data-divider-button
        className="rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:outline-none"
        onClick={onClick}
        type="button"
      >
        {parts.children}
      </button>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

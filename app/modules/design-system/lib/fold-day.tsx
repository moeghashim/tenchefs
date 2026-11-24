import type { ReactNode } from "react";
import type { SeparatorParts } from "./parts.ts";

export function FoldDay(parts: SeparatorParts): ReactNode {
  return (
    <>
      <hr aria-label={parts.label} className="flex-1 border-t border-dashed" />
      <span
        aria-hidden="true"
        className="mx-3 rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
      >
        {parts.label}
      </span>
    </>
  );
}

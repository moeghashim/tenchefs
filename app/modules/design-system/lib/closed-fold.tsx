import type { ButtonParts } from "./parts.ts";
import { FoldDay } from "./fold-day.tsx";
import type { ReactNode } from "react";
import { useId } from "react";

interface ClosedFoldParts extends ButtonParts {
  readonly day: string | null;
}

export function ClosedFold(parts: ClosedFoldParts): ReactNode {
  const { day, onClick } = parts;
  const button = useId();
  if (day !== null) {
    return (
      <FoldDay label={day} onClick={onClick}>
        {parts.children}
      </FoldDay>
    );
  }
  return (
    <article aria-labelledby={button} data-closed-fold className="my-3 flex items-center px-5">
      <span className="h-px flex-1 border-t border-dashed" />
      <button
        id={button}
        className="mx-3 rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onClick}
        type="button"
      >
        {parts.children}
      </button>
      <span className="h-px flex-1 border-t border-dashed" />
    </article>
  );
}

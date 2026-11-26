import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useId } from "react";

interface FoldDayParts extends ButtonParts {
  readonly label: string;
  readonly current: boolean;
}

export function FoldDay(parts: FoldDayParts): ReactNode {
  const { onClick } = parts;
  const button = useId();
  return (
    <article
      aria-current={parts.current}
      aria-labelledby={button}
      data-closed-fold
      className="my-3 grid grid-cols-[1fr_auto_1fr] items-center px-5"
    >
      <hr aria-label={parts.label} className="border-t border-dashed" />
      <span
        aria-hidden="true"
        className="mx-3 rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground"
      >
        {parts.label}
      </span>
      <span className="flex min-w-0 items-center">
        <span className="h-px min-w-3 flex-1 border-t border-dashed" />
        <button
          id={button}
          className="mx-3 min-w-0 truncate rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClick}
          type="button"
        >
          {parts.children}
        </button>
        <span className="h-px w-3 shrink-0 border-t border-dashed" />
      </span>
    </article>
  );
}

import type { ReactNode } from "react";

interface FeedRowClosedParts {
  readonly closed: boolean;
}

const TEXT = { closed: "Closed" } as const;

export function FeedRowClosed(parts: FeedRowClosedParts): ReactNode {
  return (
    parts.closed && (
      <span className="shrink-0 rounded-full border px-1.5 text-[11px] font-medium text-muted-foreground">
        {TEXT.closed}
      </span>
    )
  );
}

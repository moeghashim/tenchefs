import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function RepliesDivider(parts: Parts): ReactNode {
  return (
    <div className="my-3 flex items-center gap-3 px-5">
      <span className="text-xs text-muted-foreground">{parts.children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

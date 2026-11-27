import type { CallChipParts } from "./parts.ts";
import type { ReactNode } from "react";

export function CallChip(parts: CallChipParts): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[13px]">{parts.webhookCommand}</span>
      <code aria-label={parts.label} className="font-mono text-xs break-all text-muted-foreground">
        {JSON.stringify(parts.value)}
      </code>
    </div>
  );
}

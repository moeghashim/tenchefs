import type { IdentityRowParts } from "./parts.ts";
import type { ReactNode } from "react";

interface IdentityNameLineParts {
  readonly row: IdentityRowParts;
}

export function IdentityNameLine(parts: IdentityNameLineParts): ReactNode {
  const { row } = parts;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {row.displayName === null && <span className="truncate font-semibold">{row.name}</span>}
      {row.displayName !== null && (
        <>
          <span className="truncate font-semibold">{row.displayName}</span>
          <span className="truncate text-xs text-muted-foreground">{`@${row.name}`}</span>
        </>
      )}
      {row.note !== null && <span className="text-xs text-muted-foreground">{row.note}</span>}
      {row.children}
    </span>
  );
}

import type { ReactNode } from "react";

interface ResultOptionParts {
  readonly label: string;
  readonly detail: string | null;
  readonly children?: ReactNode;
}

export function ResultOption(parts: ResultOptionParts): ReactNode {
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="truncate text-foreground">{parts.label}</span>
        {parts.detail !== null && <span className="truncate text-xs text-muted-foreground">{parts.detail}</span>}
      </span>
      {parts.children}
    </>
  );
}

import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

interface CurrentItemRowParts extends Parts {
  readonly current: boolean;
}

function lookOf(current: boolean): string {
  if (current) {
    return "flex flex-col gap-1 rounded-md bg-accent px-4 py-3";
  }
  return "flex flex-col gap-1 px-4 py-3";
}

export function CurrentItemRow(parts: CurrentItemRowParts): ReactNode {
  return (
    <li aria-current={parts.current} className={lookOf(parts.current)}>
      {parts.children}
    </li>
  );
}

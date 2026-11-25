import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function Heading(parts: Parts): ReactNode {
  return (
    <h1 className="rounded-sm text-sm font-semibold tracking-tight" tabIndex={-1}>
      {parts.children}
    </h1>
  );
}

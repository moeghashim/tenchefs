import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function ProfileFrame(parts: Parts): ReactNode {
  return <div className="flex min-h-0 flex-1 flex-col">{parts.children}</div>;
}

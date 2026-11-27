import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function ProfileSections(parts: Parts): ReactNode {
  return <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pt-3 pb-5">{parts.children}</div>;
}

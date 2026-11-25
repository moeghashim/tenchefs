import type { AttachmentListParts } from "./attachment-parts.ts";
import type { ReactNode } from "react";

export function PendingList(parts: AttachmentListParts): ReactNode {
  return (
    <ul aria-label={parts.label} className="flex w-full list-none flex-wrap items-end gap-3 p-1 pt-2">
      {parts.children}
    </ul>
  );
}

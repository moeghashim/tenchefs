import type { AttachmentListParts } from "./attachment-parts.ts";
import type { ReactNode } from "react";

export function AttachmentList(parts: AttachmentListParts): ReactNode {
  return (
    <ul aria-label={parts.label} className="mt-1.5 flex list-none flex-wrap items-end gap-2 p-0">
      {parts.children}
    </ul>
  );
}

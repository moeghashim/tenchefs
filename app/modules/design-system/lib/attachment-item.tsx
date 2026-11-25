import type { ReactNode } from "react";

interface AttachmentItemParts {
  readonly children: ReactNode;
}

export function AttachmentItem(parts: AttachmentItemParts): ReactNode {
  return <li className="flex">{parts.children}</li>;
}

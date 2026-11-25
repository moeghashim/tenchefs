import { FileIcon } from "./file-icon.tsx";
import type { ReactNode } from "react";

interface FileChipTextParts {
  readonly name: string;
  readonly detail: string;
}

export function FileChipText(parts: FileChipTextParts): ReactNode {
  return (
    <>
      <FileIcon />
      <span className="truncate font-medium text-foreground">{parts.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{parts.detail}</span>
    </>
  );
}

import { DropZone } from "./drop-zone.tsx";
import type { FilesHandler } from "./drop-zone.tsx";
import type { ReactNode } from "react";

interface FileDropParts {
  readonly onFiles: FilesHandler | null;
  readonly children: ReactNode;
}

export function FileDrop(parts: FileDropParts): ReactNode {
  if (parts.onFiles === null) {
    return parts.children;
  }
  const handleFiles = parts.onFiles;
  return <DropZone onFiles={handleFiles}>{parts.children}</DropZone>;
}

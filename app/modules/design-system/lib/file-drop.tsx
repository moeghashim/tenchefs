import type { DragEvent, ReactNode } from "react";
import { useCallback } from "react";

const FILES = "Files";

interface FileDropParts {
  readonly onFiles: (files: readonly File[]) => void;
  readonly children: ReactNode;
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(FILES);
}

export function FileDrop(parts: FileDropParts): ReactNode {
  const { onFiles } = parts;
  const handleDragOver = useCallback((event: DragEvent) => {
    if (carriesFiles(event)) {
      event.preventDefault();
    }
  }, []);
  const handleDrop = useCallback(
    (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault();
        onFiles([...event.dataTransfer.files]);
      }
    },
    [onFiles],
  );
  return (
    <div onDragOver={handleDragOver} onDrop={handleDrop}>
      {parts.children}
    </div>
  );
}

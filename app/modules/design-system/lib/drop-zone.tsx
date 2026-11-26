import type { DragEvent, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

const FILES = "Files";
const NONE = 0;
const ONE = 1;
const ZONE = "relative flex min-h-0 min-w-0 flex-1 flex-col";
const LIT = `${ZONE} bg-hover ring-2 ring-link/60 ring-inset`;

type FilesHandler = (files: readonly File[]) => void;

interface DropZoneParts {
  readonly onFiles: FilesHandler;
  readonly children: ReactNode;
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(FILES);
}

function lookOf(dropping: boolean): string {
  if (dropping) {
    return LIT;
  }
  return ZONE;
}

export function DropZone(parts: DropZoneParts): ReactNode {
  const { onFiles } = parts;
  const inside = useRef(NONE);
  const [dropping, setDropping] = useState(false);
  const handleDragEnter = useCallback((event: DragEvent) => {
    if (carriesFiles(event)) {
      inside.current += ONE;
      setDropping(true);
    }
  }, []);
  const handleDragLeave = useCallback((event: DragEvent) => {
    if (carriesFiles(event)) {
      inside.current = Math.max(NONE, inside.current - ONE);
      setDropping(inside.current > NONE);
    }
  }, []);
  const handleDragOver = useCallback((event: DragEvent) => {
    if (carriesFiles(event)) {
      event.preventDefault();
    }
  }, []);
  const handleDrop = useCallback(
    (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault();
        inside.current = NONE;
        setDropping(false);
        onFiles([...event.dataTransfer.files]);
      }
    },
    [onFiles],
  );
  return (
    <div
      className={lookOf(dropping)}
      data-dropping={dropping}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {parts.children}
    </div>
  );
}
export type { FilesHandler };

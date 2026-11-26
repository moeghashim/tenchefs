import { useEffect } from "react";

const FILES = "Files";

interface Dragged {
  readonly dataTransfer: { readonly types: readonly string[] } | null;
  readonly preventDefault: () => void;
}

function refuseFiles(event: Dragged): void {
  const carried = event.dataTransfer;
  if (carried === null) {
    return;
  }
  if (carried.types.includes(FILES)) {
    event.preventDefault();
  }
}

function useStrayDropGuard(): void {
  useEffect(() => {
    globalThis.addEventListener("dragover", refuseFiles);
    globalThis.addEventListener("drop", refuseFiles);
    return (): void => {
      globalThis.removeEventListener("dragover", refuseFiles);
      globalThis.removeEventListener("drop", refuseFiles);
    };
  }, []);
}

export { useStrayDropGuard };

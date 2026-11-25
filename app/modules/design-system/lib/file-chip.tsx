import type { FileChipParts } from "./attachment-parts.ts";
import { FileChipText } from "./file-chip-text.tsx";
import type { ReactNode } from "react";

const CHIP = "flex max-w-64 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-sm text-muted-foreground";

export function FileChip(parts: FileChipParts): ReactNode {
  if (parts.href === null) {
    return (
      <span className={CHIP}>
        <FileChipText detail={parts.detail} name={parts.name} />
      </span>
    );
  }
  return (
    <a
      className={`${CHIP} hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      download={parts.name}
      href={parts.href}
    >
      <FileChipText detail={parts.detail} name={parts.name} />
    </a>
  );
}

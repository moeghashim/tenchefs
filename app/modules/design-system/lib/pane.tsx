import { FileDrop } from "./file-drop.tsx";
import type { FilesHandler } from "./drop-zone.tsx";
import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

interface PaneParts extends Parts {
  readonly onFiles?: FilesHandler | null;
}

export function Pane(parts: PaneParts): ReactNode {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <FileDrop onFiles={parts.onFiles ?? null}>{parts.children}</FileDrop>
    </section>
  );
}

import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";
import { useNarrowScreen } from "./use-narrow-screen.ts";

interface WorkspaceColumnParts extends Parts {
  readonly sidebarOpen: boolean;
}

export function WorkspaceColumn(parts: WorkspaceColumnParts): ReactNode {
  const narrow = useNarrowScreen();
  const covered = parts.sidebarOpen && narrow;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" inert={covered}>
      {parts.children}
    </div>
  );
}

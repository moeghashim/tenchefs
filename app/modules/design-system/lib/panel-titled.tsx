import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { ThreadMetaIcon } from "./thread-meta-icon.tsx";
import { useOffered } from "./use-offered.ts";

interface PanelTitledParts {
  readonly title: string;
  readonly detail: string;
  readonly tabIndex?: number;
  readonly choices: readonly MenuChoice[];
}

export function PanelTitled(parts: PanelTitledParts): ReactNode {
  const heading = useOffered<HTMLHeadingElement>({ choices: parts.choices });
  return (
    <div className="flex w-0 min-w-0 flex-1 flex-col gap-0.5">
      <h2
        className="truncate rounded-sm text-[15px] leading-tight font-semibold"
        ref={heading}
        tabIndex={parts.tabIndex}
      >
        {parts.title}
      </h2>
      <p className="flex items-center gap-1 font-mono text-[11px] leading-tight text-muted-foreground">
        <ThreadMetaIcon />
        <span className="truncate">{parts.detail}</span>
      </p>
    </div>
  );
}

import type { LinkParts } from "./parts.ts";
import type { ReactNode } from "react";

interface HoverActionParts extends LinkParts {
  readonly name: string;
}

export function HoverAction(parts: HoverActionParts): ReactNode {
  return (
    <a
      aria-label={parts.name}
      className="block rounded-md border bg-background px-1.5 py-0.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground"
      href={parts.href}
      title={parts.name}
    >
      {parts.children}
    </a>
  );
}

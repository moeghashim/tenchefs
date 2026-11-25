import type { PaneHeaderParts } from "./parts.ts";
import type { ReactNode } from "react";

function fontOf(sans: boolean): string {
  if (sans) {
    return "";
  }
  return "font-mono ";
}

export function PaneHeader(parts: PaneHeaderParts): ReactNode {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <h1 className={`${fontOf(parts.sans === true)}rounded-sm text-[15px] font-semibold`} tabIndex={-1}>
        {parts.title}
      </h1>
      {parts.description !== null && parts.description !== "" && (
        <p className="truncate border-l pl-3 text-xs text-muted-foreground">{parts.description}</p>
      )}
      <div className="ml-auto shrink-0">{parts.children}</div>
    </header>
  );
}

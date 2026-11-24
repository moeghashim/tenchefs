import { Avatar } from "./avatar.tsx";
import type { IdentityRowParts } from "./parts.ts";
import { IdentityRowText } from "./identity-row-text.tsx";
import type { ReactNode } from "react";
import { presenceNameOf } from "./presence-name.ts";

function rowStyle(active: boolean): string {
  if (active) {
    return "bg-accent";
  }
  return "hover:bg-hover";
}

function currentOf(active: boolean): "page" | false {
  if (active) {
    return "page";
  }
  return false;
}

interface IdentityRowLinkParts {
  readonly row: IdentityRowParts;
}

export function IdentityRowLink(parts: IdentityRowLinkParts): ReactNode {
  const { row } = parts;
  return (
    <a
      aria-current={currentOf(row.active)}
      aria-label={presenceNameOf({ name: row.displayName ?? row.name, presence: row.presence })}
      className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 ${rowStyle(row.active)}`}
      href={row.href}
    >
      <Avatar agent={row.agent} name={row.name} presence={row.presence} />
      <IdentityRowText row={row} />
    </a>
  );
}

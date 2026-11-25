import { IdentityRowLink } from "./identity-row-link.tsx";
import type { IdentityRowParts } from "./parts.ts";
import { PersonMenu } from "./person-menu.tsx";
import type { ReactNode } from "react";

export function IdentityRow(parts: IdentityRowParts): ReactNode {
  return (
    <li>
      <PersonMenu inline={false} moreInTabOrder={false} name={parts.name} profileHref={parts.href}>
        <IdentityRowLink row={parts} />
      </PersonMenu>
    </li>
  );
}

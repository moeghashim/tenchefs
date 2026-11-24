import { Avatar } from "./avatar.tsx";
import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import { IdentityCardName } from "./identity-card-name.tsx";
import type { ReactNode } from "react";

export function IdentityCardHeader(parts: IdentityCardBoxParts): ReactNode {
  const { card } = parts;
  return (
    <div className="mb-1 flex items-center gap-3">
      <Avatar agent={card.agent} name={card.name} presence={card.presence} size="large" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <IdentityCardName card={card} />
        {card.displayName !== null && <p className="truncate text-xs text-muted-foreground">{`@${card.name}`}</p>}
      </div>
    </div>
  );
}

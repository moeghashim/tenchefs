import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const TEXT = { deactivated: "Deactivated" } as const;

export function IdentityCardFacts(parts: IdentityCardBoxParts): ReactNode {
  const { card } = parts;
  return (
    <>
      {card.presence !== null && <p className="text-xs text-muted-foreground">{card.presence.label}</p>}
      <p className="text-xs text-muted-foreground">{card.kind}</p>
      {card.description !== null && <p className="whitespace-pre-line">{card.description}</p>}
      {card.deactivated && <p className="text-xs font-medium text-muted-foreground">{TEXT.deactivated}</p>}
    </>
  );
}

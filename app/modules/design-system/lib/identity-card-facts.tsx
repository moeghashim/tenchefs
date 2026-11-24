import { IdentityCardBroughtInBy } from "./identity-card-brought-in-by.tsx";
import { IdentityCardPresence } from "./identity-card-presence.tsx";
import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const DEACTIVATED = "Deactivated";

export function IdentityCardFacts(parts: IdentityCardShownParts): ReactNode {
  const { card } = parts;
  return (
    <div className="flex flex-col gap-1">
      {card.deactivated && <p className="text-[13px] leading-5 font-medium text-destructive">{DEACTIVATED}</p>}
      {!card.deactivated && <IdentityCardPresence card={card} />}
      <p className="text-[13px] leading-5 text-muted-foreground">{card.kind}</p>
      {card.broughtInBy !== null && <IdentityCardBroughtInBy bringer={card.broughtInBy} />}
    </div>
  );
}

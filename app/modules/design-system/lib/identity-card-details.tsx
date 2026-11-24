import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import { IdentityCardButtons } from "./identity-card-buttons.tsx";
import { IdentityCardFacts } from "./identity-card-facts.tsx";
import { IdentityCardNames } from "./identity-card-names.tsx";
import type { ReactNode } from "react";

export function IdentityCardDetails(parts: IdentityCardBoxParts): ReactNode {
  const { card } = parts;
  return (
    <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
      <IdentityCardNames card={card} />
      <IdentityCardFacts card={card} />
      {card.description !== null && (
        <p className="border-l-2 pl-2.5 text-[13px] leading-5 whitespace-pre-line text-muted-foreground">
          {card.description}
        </p>
      )}
      <IdentityCardButtons card={card} control={parts.control} />
    </div>
  );
}

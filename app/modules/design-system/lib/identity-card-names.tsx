import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

export function IdentityCardNames(parts: IdentityCardShownParts): ReactNode {
  const { card } = parts;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="truncate text-lg leading-6 font-bold tracking-tight">{card.displayName ?? card.name}</p>
      {card.displayName !== null && (
        <p className="truncate text-[13px] leading-5 text-muted-foreground">{`@${card.name}`}</p>
      )}
    </div>
  );
}

import { hueOf, initialsOf } from "./avatar-look.ts";
import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const AGENT = "Agent";

function lookOf(parts: IdentityCardShownParts): string {
  const { card } = parts;
  if (card.deactivated) {
    return `${hueOf(card.name)} brightness-75 grayscale`;
  }
  return hueOf(card.name);
}

export function IdentityCardTile(parts: IdentityCardShownParts): ReactNode {
  const { card } = parts;
  return (
    <div className={`relative h-60 w-full shrink-0 overflow-hidden ${lookOf(parts)}`}>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/20" />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[88px] leading-none font-semibold tracking-tight text-white drop-shadow-sm select-none before:content-[attr(data-initials)]"
        data-agent={card.agent}
        data-deactivated={card.deactivated}
        data-initials={initialsOf(card.name)}
        data-testid="avatar"
      />
      {card.agent && (
        <span className="absolute top-2.5 left-2.5 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase backdrop-blur-sm">
          {AGENT}
        </span>
      )}
    </div>
  );
}

import { IdentityCardFace } from "./identity-card-face.tsx";
import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";
import { hueOf } from "./avatar-look.ts";

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
      <IdentityCardFace card={card} />
      {card.agent && (
        <span className="absolute top-2.5 left-2.5 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase backdrop-blur-sm">
          {AGENT}
        </span>
      )}
    </div>
  );
}

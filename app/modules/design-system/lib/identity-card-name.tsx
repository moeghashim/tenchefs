import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";
import { Tag } from "./tag.tsx";

const AGENT = "agent";

export function IdentityCardName(parts: IdentityCardBoxParts): ReactNode {
  const { card } = parts;
  return (
    <p className="flex min-w-0 items-center gap-2 font-semibold">
      <span className="truncate">{card.displayName ?? card.name}</span>
      {card.agent && <Tag label={AGENT} />}
    </p>
  );
}

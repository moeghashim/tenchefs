import { useContext, useSyncExternalStore } from "react";
import { IdentityCardRoot } from "./identity-card-root.tsx";
import type { IdentityCardTriggerParts } from "./identity-card-parts.ts";
import { IdentityCards } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

export function IdentityCard(parts: IdentityCardTriggerParts): ReactNode {
  const source = useContext(IdentityCards);
  const card = useSyncExternalStore(source.subscribe, () => source.cardOf(parts.name));
  if (card === null) {
    return parts.children;
  }
  return <IdentityCardRoot card={card}>{parts.children}</IdentityCardRoot>;
}

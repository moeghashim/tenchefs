import { Provider, Root, Trigger } from "@radix-ui/react-tooltip";
import { useContext, useSyncExternalStore } from "react";
import { IdentityCardPortal } from "./identity-card-portal.tsx";
import type { IdentityCardTriggerParts } from "./identity-card-parts.ts";
import { IdentityCards } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const DELAY_MS = 500;

export function IdentityCard(parts: IdentityCardTriggerParts): ReactNode {
  const source = useContext(IdentityCards);
  const card = useSyncExternalStore(source.subscribe, () => source.cardOf(parts.name));
  if (card === null) {
    return parts.children;
  }
  return (
    <Provider delayDuration={DELAY_MS}>
      <Root>
        <Trigger asChild>{parts.children}</Trigger>
        <IdentityCardPortal card={card} />
      </Root>
    </Provider>
  );
}

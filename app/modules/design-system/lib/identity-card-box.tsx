import type { IdentityCardBoxParts, IdentityCardParts } from "./identity-card-parts.ts";
import { Content } from "@radix-ui/react-tooltip";
import { IdentityCardDetails } from "./identity-card-details.tsx";
import { IdentityCardTile } from "./identity-card-tile.tsx";
import type { ReactNode } from "react";

const OFFSET_PX = 6;
const PADDING_PX = 12;
const DEACTIVATED = "Deactivated";

function factsOf(card: IdentityCardParts): string {
  if (card.deactivated) {
    return `${DEACTIVATED}, ${card.kind}`;
  }
  if (card.presence === null) {
    return card.kind;
  }
  return `${card.presence.label}, ${card.kind}`;
}

export function IdentityCardBox(parts: IdentityCardBoxParts): ReactNode {
  const { card, control } = parts;
  const handleEscape = control.onEscape;
  const handleOutside = control.onClose;
  return (
    <Content
      align="start"
      aria-label={factsOf(card)}
      asChild
      collisionPadding={PADDING_PX}
      onEscapeKeyDown={handleEscape}
      onPointerDownOutside={handleOutside}
      side="right"
      sideOffset={OFFSET_PX}
    >
      <dialog
        aria-label={card.displayName ?? card.name}
        className="static z-50 m-0 flex w-64 flex-col overflow-hidden rounded-xl border bg-card p-0 text-sm text-foreground shadow-xl"
        data-identity-card-box={control.mark}
        open
      >
        <IdentityCardTile card={card} />
        <IdentityCardDetails card={card} control={control} />
      </dialog>
    </Content>
  );
}

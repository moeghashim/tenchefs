import { Content } from "@radix-ui/react-tooltip";
import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import { IdentityCardFacts } from "./identity-card-facts.tsx";
import { IdentityCardHeader } from "./identity-card-header.tsx";
import type { ReactNode } from "react";

const OFFSET_PX = 4;
const TEXT = { viewProfile: "View profile" } as const;

export function IdentityCardBox(parts: IdentityCardBoxParts): ReactNode {
  const { card } = parts;
  return (
    <Content asChild side="bottom" sideOffset={OFFSET_PX}>
      <div className="z-50 flex w-72 flex-col gap-1 rounded-lg border bg-card p-3 text-sm text-foreground shadow-md">
        <IdentityCardHeader card={card} />
        <IdentityCardFacts card={card} />
        <a className="mt-1 self-start text-xs font-medium hover:underline" href={card.profileHref}>
          {TEXT.viewProfile}
        </a>
      </div>
    </Content>
  );
}

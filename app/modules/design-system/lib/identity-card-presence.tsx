import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import { PresenceDot } from "./presence-dot.tsx";
import type { ReactNode } from "react";

export function IdentityCardPresence(parts: IdentityCardShownParts): ReactNode {
  const { name, presence } = parts.card;
  if (presence === null) {
    return null;
  }
  return (
    <p className="flex items-start gap-2 text-[13px] leading-5 text-foreground">
      <span className="flex h-5 items-center">
        <PresenceDot
          label={presence.label}
          name={name}
          online={presence.online}
          place="card"
          spoken={presence.spoken}
          unreachable={presence.unreachable}
          warning={presence.warning}
        />
      </span>
      <span>{presence.label}</span>
    </p>
  );
}

import { AvatarFace } from "./avatar-face.tsx";
import type { AvatarParts } from "./avatar-parts.ts";
import { PresenceDot } from "./presence-dot.tsx";
import type { ReactNode } from "react";

export function Avatar(parts: AvatarParts): ReactNode {
  const { presence } = parts;
  return (
    <span className="relative inline-flex h-fit shrink-0">
      <AvatarFace agent={parts.agent} name={parts.name} size={parts.size ?? "small"} />
      {presence !== null && (
        <PresenceDot
          label={presence.label}
          name={parts.name}
          online={presence.online}
          spoken={presence.spoken}
          unreachable={presence.unreachable}
          warning={presence.warning}
        />
      )}
    </span>
  );
}

import { Avatar } from "./avatar.tsx";
import { PresenceDot } from "./presence-dot.tsx";
import type { ReactNode } from "react";
import type { SuggestionOptionParts } from "./avatar-parts.ts";

export function SuggestionOption(parts: SuggestionOptionParts): ReactNode {
  const { identity, option, presence } = parts;
  return (
    <>
      {identity !== null && <Avatar agent={identity.agent} name={identity.name} presence={null} size="tiny" />}
      {presence !== null && (
        <PresenceDot
          label={presence.label}
          name={option}
          online={presence.online}
          place="inline"
          spoken={presence.spoken}
          unreachable={presence.unreachable}
          warning={presence.warning}
        />
      )}
      <span>{option}</span>
      {parts.detail !== null && <span className="truncate text-xs text-muted-foreground">{parts.detail}</span>}
    </>
  );
}

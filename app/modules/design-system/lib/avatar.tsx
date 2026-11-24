import { hueOf, initialsOf } from "./avatar-look.ts";
import type { AvatarParts } from "./avatar-parts.ts";
import { PresenceDot } from "./presence-dot.tsx";
import type { ReactNode } from "react";

const SIZES = {
  large: { box: "h-14 w-14 text-lg", testId: "avatar" },
  small: { box: "h-8 w-8 text-xs", testId: "avatar" },
  tiny: { box: "h-5 w-5 text-[9px] ring-2 ring-background", testId: "replier-avatar" },
} as const;

function shapeOf(agent: boolean): string {
  if (agent) {
    return "rounded-[28%]";
  }
  return "rounded-full";
}

export function Avatar(parts: AvatarParts): ReactNode {
  const size = SIZES[parts.size ?? "small"];
  const { presence } = parts;
  return (
    <span className="relative inline-flex h-fit shrink-0">
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center font-semibold text-white select-none before:content-[attr(data-initials)] ${size.box} ${shapeOf(parts.agent)} ${hueOf(parts.name)}`}
        data-agent={parts.agent}
        data-initials={initialsOf(parts.name)}
        data-testid={size.testId}
      />
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

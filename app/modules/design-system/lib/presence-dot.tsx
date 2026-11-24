import type { PresenceDotParts } from "./avatar-parts.ts";
import type { ReactNode } from "react";
import { presenceNameOf } from "./presence-name.ts";

const PLACES = {
  avatar: "absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-background",
  card: "size-2.5",
  inline: "size-2 self-center",
} as const;

type Shown = "online" | "offline" | "unreachable" | "warning";

const LOOKS: Readonly<Record<Shown, string>> = {
  offline: "fill-background stroke-muted-foreground",
  online: "fill-online",
  unreachable: "fill-destructive",
  warning: "fill-background stroke-mention-bar",
};

function presenceOf({ online, unreachable, warning }: PresenceDotParts): Shown {
  if (online) {
    return "online";
  }
  if (unreachable) {
    return "unreachable";
  }
  if (warning) {
    return "warning";
  }
  return "offline";
}

export function PresenceDot(parts: PresenceDotParts): ReactNode {
  const shown = presenceOf(parts);
  return (
    <span className={`flex shrink-0 rounded-full bg-background ${PLACES[parts.place ?? "avatar"]}`} title={parts.label}>
      <svg
        aria-label={presenceNameOf({ name: parts.name, presence: parts })}
        className={`size-full ${LOOKS[shown]}`}
        data-presence={shown}
        role="img"
        viewBox="0 0 12 12"
      >
        <circle cx="6" cy="6" r="4.5" strokeWidth="2.5" />
        {shown === "warning" && <circle className="fill-mention-bar stroke-none" cx="6" cy="6" r="1.75" />}
      </svg>
    </span>
  );
}

import type { IdentityName, LiveConnectionDetail, Presence } from "../../sdk/index.ts";
import { isUnreachable, reachText, unreachableBrief } from "./trigger-presence.ts";
import type { Presences } from "../../board/index.ts";
import { onTick } from "./use-time-ago.ts";
import { presences } from "../../board/index.ts";
import { timeAgo } from "../../format/index.ts";
import { useBoardStore } from "./use-board.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  lastSeen: "last seen ",
  offline: "Offline",
  online: "Online",
  watching: "watching",
  watchingFrom: "watching from ",
  web: "web",
  wentOffline: "Went offline unexpectedly",
  wentOfflineLabel: "Offline, went offline unexpectedly",
} as const;

interface PresenceShown {
  readonly online: boolean;
  readonly warning: boolean;
  readonly unreachable: boolean;
  readonly label: string;
  readonly spoken: string;
}

interface Among {
  readonly presences: Presences;
  readonly name: IdentityName;
}

function lastSeenOf(presence: Presence): string | null {
  const at = presence.lastSeenAt ?? null;
  if (at === null) {
    return null;
  }
  return `${TEXT.lastSeen}${timeAgo(at)}`;
}

function offlineText(presence: Presence, between: string): string {
  const lastSeen = lastSeenOf(presence);
  if (lastSeen === null) {
    return TEXT.offline;
  }
  return `${TEXT.offline}${between}${lastSeen}`;
}

interface Warned extends Presence {
  readonly lastSeenAt: NonNullable<Presence["lastSeenAt"]>;
  readonly offlineReason: NonNullable<Presence["offlineReason"]>;
}

function warnedOf(presence: Presence): presence is Warned {
  return (
    !presence.online &&
    presence.warning === true &&
    typeof presence.lastSeenAt === "string" &&
    typeof presence.offlineReason === "string"
  );
}

function connectedLabel(presence: Presence): string {
  if (presence.online) {
    return TEXT.online;
  }
  if (warnedOf(presence)) {
    return TEXT.wentOfflineLabel;
  }
  return offlineText(presence, ", ");
}

function labelOf(presence: Presence): string {
  return reachText(presence) ?? connectedLabel(presence);
}

function connectionOf(connection: LiveConnectionDetail): string {
  if (connection.via === "web") {
    return TEXT.web;
  }
  const host = connection.host ?? null;
  if (host === null) {
    return TEXT.watching;
  }
  return `${TEXT.watchingFrom}${host}`;
}

function offlineDetail(presence: Presence): string {
  const reason = presence.offlineReason ?? null;
  const text = offlineText(presence, " · ");
  if (reason === null) {
    return text;
  }
  return `${TEXT.offline}: ${reason}${text.slice(TEXT.offline.length)}`;
}

function warningDetail(presence: Warned): string {
  return `${TEXT.wentOffline} ${timeAgo(presence.lastSeenAt)}: ${presence.offlineReason}`;
}

function connectedDetail(presence: Presence): string {
  if (warnedOf(presence)) {
    return warningDetail(presence);
  }
  if (!presence.online) {
    return offlineDetail(presence);
  }
  const connection = presence.connection ?? null;
  if (connection === null) {
    return TEXT.online;
  }
  return `${TEXT.online} · ${connectionOf(connection)}`;
}

function detailOf(presence: Presence): string {
  return reachText(presence) ?? connectedDetail(presence);
}

function shownOf(presence: Presence, label: string): PresenceShown {
  return {
    label,
    online: presence.online,
    spoken: label,
    unreachable: isUnreachable(presence),
    warning: warnedOf(presence),
  };
}

function usePresences(): Presences {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribeShowing("presence"), () => presences(store.snapshot()));
}

function usePresenceOf(name: IdentityName): Presence | null {
  return usePresences().get(name) ?? null;
}

function shownIn(among: Among): PresenceShown | null {
  const presence = among.presences.get(among.name) ?? null;
  if (presence === null) {
    return null;
  }
  const label = labelOf(presence);
  return shownOf(presence, label);
}

function useTicking(presence: Presence | null, text: (known: Presence) => string): string | null {
  return useSyncExternalStore(onTick, () => {
    if (presence === null) {
      return null;
    }
    return text(presence);
  });
}

function usePresence(name: IdentityName): PresenceShown | null {
  const presence = usePresenceOf(name);
  const label = useTicking(presence, labelOf);
  if (presence === null || label === null) {
    return null;
  }
  return shownOf(presence, label);
}

function briefOf({ online, unreachable, warning }: PresenceShown): string {
  if (online) {
    return TEXT.online;
  }
  if (unreachable) {
    return unreachableBrief;
  }
  if (warning) {
    return TEXT.wentOfflineLabel;
  }
  return TEXT.offline;
}

function useAuthorPresence(name: IdentityName): PresenceShown | null {
  const presence = usePresence(name);
  if (presence === null) {
    return null;
  }
  return { ...presence, spoken: briefOf(presence) };
}

function usePresenceDetail(name: IdentityName): string | null {
  return useTicking(usePresenceOf(name), detailOf);
}

export { type PresenceShown, shownIn, useAuthorPresence, usePresence, usePresenceDetail, usePresences };

import type { Presence, TriggerResult } from "../../sdk/index.ts";
import { timeAgo } from "../../format/index.ts";

const TEXT = {
  status: "HTTP ",
  unreachable: "Unreachable",
  wakesOnMention: "Wakes on mention",
} as const;

function outcomeOf({ error, status }: TriggerResult): string {
  if (typeof status === "number") {
    return `${TEXT.status}${String(status)}`;
  }
  return error ?? TEXT.unreachable;
}

function unreachableText(result: TriggerResult): string {
  return `${TEXT.unreachable}: ${outcomeOf(result)}, ${timeAgo(result.at)}`;
}

function isUnreachable(presence: Presence): boolean {
  return !presence.online && typeof presence.unreachable === "object";
}

function unreachableOf(presence: Presence): string | null {
  const result = presence.unreachable ?? null;
  if (presence.online || result === null) {
    return null;
  }
  return unreachableText(result);
}

function reachText(presence: Presence): string | null {
  if (presence.online && presence.wakesOnMention === true) {
    return TEXT.wakesOnMention;
  }
  return unreachableOf(presence);
}

const unreachableBrief: string = TEXT.unreachable;

export { isUnreachable, reachText, unreachableBrief };

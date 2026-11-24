import { DateTime, Effect, Predicate, Record as Rec } from "effect";
import type { ScheduledMessage, ScheduledMessageRun } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import type { Author } from "../../../messages/index.ts";
import type { Identity } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { runsAfter } from "./timing.ts";
import { scheduleTiming } from "../../index.ts";

function present<Key extends string, Value>(key: Key, value: Value | null): Partial<Record<Key, Value>> {
  if (value === null) {
    return {};
  }
  return Rec.singleton(key, value);
}

function authorOf(creator: StoredScheduledMessage["creator"], found: Identity | undefined): Author {
  if (Predicate.isUndefined(found) || found.kind === "human") {
    return { name: creator };
  }
  return { name: creator, owner: found.owner };
}

function lastRunOf(lastRun: StoredScheduledMessage["lastRun"]): Partial<Record<"lastRun", ScheduledMessageRun>> {
  if (lastRun === null) {
    return {};
  }
  return { lastRun: { due: lastRun.due, outcome: lastRun.outcome, ...present("messageId", lastRun.messageId) } };
}

function nextRunsOf(stored: StoredScheduledMessage, now: IsoTime): readonly IsoTime[] {
  if (stored.status !== "active") {
    return [];
  }
  return runsAfter({ count: scheduleTiming.shownRuns, now, timing: stored });
}

function shownOf(stored: StoredScheduledMessage, creator: Identity | undefined, now: IsoTime): ScheduledMessage {
  return {
    channel: stored.channel,
    createdAt: stored.createdAt,
    creator: authorOf(stored.creator, creator),
    id: stored.id,
    nextRuns: nextRunsOf(stored, now),
    status: stored.status,
    text: stored.text,
    timeZone: stored.timeZone,
    updatedAt: stored.updatedAt,
    ...present("cron", stored.cron),
    ...present("at", stored.at),
    ...present("pausedBecause", stored.pausedBecause),
    ...lastRunOf(stored.lastRun),
  };
}

function shownWith(
  storage: Storage["Service"],
): (stored: StoredScheduledMessage) => Effect.Effect<ScheduledMessage, StorageUnavailable> {
  return (stored) =>
    Effect.zipWith(storage.findIdentityByName(stored.creator), DateTime.now, (creator, now) =>
      shownOf(stored, creator, isoTimeOf(now)),
    );
}

export { shownWith };

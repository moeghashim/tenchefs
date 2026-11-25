import { Array as Arr, DateTime, Duration, Effect, Option, Order, Predicate } from "effect";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import { isLate, latestDue, millisOf, runsAfter } from "./timing.ts";
import type { Announcing } from "./announced.ts";
import type { Cause } from "effect";
import type { IsoTime } from "../../../time/index.ts";
import type { Messages } from "../../../messages/server.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

interface Running {
  readonly storage: Storage["Service"];
  readonly messages: Messages["Service"];
  readonly woken: Effect.Effect<unknown>;
  readonly announcing: Announcing;
}

const NO_WAIT = 0;
const SOONEST = 1;

function untilDue(next: IsoTime | undefined): Effect.Effect<void> {
  if (Predicate.isUndefined(next)) {
    return Effect.never;
  }
  return Effect.flatMap(DateTime.now, (now) => {
    const wait = Math.max(millisOf(next) - DateTime.toEpochMillis(now), NO_WAIT);
    return Effect.sleep(Duration.millis(wait));
  });
}

function isRefusal(error: unknown): error is Refusal | Cause.NoSuchElementError {
  return !Predicate.isTagged(error, "StorageUnavailable");
}

function postDue(
  running: Running,
  schedule: StoredScheduledMessage,
  due: IsoTime,
): Effect.Effect<void, StorageUnavailable> {
  const run = { due, finished: schedule.cron === null, id: schedule.id, runsFrom: schedule.runsFrom };
  const creator = Effect.flatMap(running.storage.findIdentityByName(schedule.creator), Effect.fromNullishOr);
  const posting = Effect.flatMap(creator, (found) =>
    running.messages.postScheduled(found, { channel: schedule.channel, text: schedule.text }, run),
  );
  return Effect.catchIf(Effect.asVoid(posting), isRefusal, () => Effect.void);
}

function announceRun(running: Running, schedule: StoredScheduledMessage): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(running.storage.findScheduledMessage(schedule.id), (found) =>
    Effect.forEach(
      Option.toArray(Option.fromNullishOr(found)),
      (still) => Effect.asVoid(running.announcing.shownAndAnnounced(still, false)),
      { concurrency: 1, discard: true },
    ),
  );
}

interface Due {
  readonly schedule: StoredScheduledMessage;
  readonly due: IsoTime;
  readonly now: IsoTime;
}

function runDue(running: Running, { due, now, schedule }: Due): Effect.Effect<void, StorageUnavailable> {
  if (isLate({ due, now })) {
    const run = { due, finished: schedule.cron === null, id: schedule.id, runsFrom: schedule.runsFrom };
    return Effect.asVoid(running.storage.runScheduledMessage(run));
  }
  return postDue(running, schedule, due);
}

function handle(running: Running, now: IsoTime) {
  return (schedule: StoredScheduledMessage): Effect.Effect<void, StorageUnavailable> => {
    const due = latestDue({ now, timing: schedule });
    if (Option.isNone(due)) {
      return Effect.void;
    }
    return Effect.andThen(runDue(running, { due: due.value, now, schedule }), announceRun(running, schedule));
  };
}

function soonestRun(schedules: readonly StoredScheduledMessage[], now: IsoTime): IsoTime | undefined {
  const next = Arr.flatMap(schedules, (timing) => runsAfter({ count: SOONEST, now, timing }));
  return Arr.head(Arr.sort(next, Order.String)).pipe(Option.getOrUndefined);
}

function activeIn(storage: Storage["Service"]): Effect.Effect<readonly StoredScheduledMessage[], StorageUnavailable> {
  return Effect.map(
    storage.listScheduledMessages(),
    Arr.filter(({ status }) => status === "active"),
  );
}

function runThenWait(running: Running): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* runDueSchedules() {
    const now = yield* Effect.map(DateTime.now, isoTimeOf);
    const due = yield* activeIn(running.storage);
    yield* Effect.forEach(due, handle(running, now), { concurrency: 1, discard: true });
    const after = yield* activeIn(running.storage);
    yield* Effect.raceFirst(untilDue(soonestRun(after, now)), Effect.asVoid(running.woken));
  });
}

export { runThenWait };

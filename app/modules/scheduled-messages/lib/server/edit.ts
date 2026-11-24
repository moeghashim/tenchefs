import { DateTime, Effect, Option, Predicate, Result } from "effect";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import { runsAfter, timingOf } from "./timing.ts";
import type { EditScheduledMessageRequestSchema } from "./wire.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { scheduleTiming } from "../../index.ts";
import { timingRefusal } from "./refusals.ts";

type EditRequest = typeof EditScheduledMessageRequestSchema.Type;

type Timed = Pick<StoredScheduledMessage, "cron" | "at" | "timeZone">;

interface Asked {
  readonly cron?: string;
  readonly at?: string;
  readonly timeZone: string;
}

interface Editing {
  readonly storage: Storage["Service"];
  readonly stored: StoredScheduledMessage;
  readonly asked: EditRequest;
}

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

function present(key: "cron" | "at", value: string | null | undefined): Partial<Record<"cron" | "at", string>> {
  if (Predicate.isNullish(value)) {
    return {};
  }
  return { [key]: value };
}

function askedTiming({ asked, stored }: Omit<Editing, "storage">): Option.Option<Asked> {
  const timeZone = asked.timeZone ?? stored.timeZone;
  if (Predicate.isNotUndefined(asked.cron) || Predicate.isNotUndefined(asked.at)) {
    return Option.some({ timeZone, ...present("cron", asked.cron), ...present("at", asked.at) });
  }
  return Option.map(Option.fromUndefinedOr(asked.timeZone), () => ({
    timeZone,
    ...present("cron", stored.cron),
    ...present("at", stored.at),
  }));
}

function checkedTiming(editing: Omit<Editing, "storage">, now: DateTime.Utc): Result.Result<Timed, Refusal> {
  return Option.match(askedTiming(editing), {
    onNone: () => Result.succeed(editing.stored),
    onSome: (timing) => Result.mapError(timingOf({ ...timing, now }), timingRefusal),
  });
}

function editedIn(editing: Editing): Fails<StoredScheduledMessage | undefined> {
  const { asked, storage, stored } = editing;
  return Effect.flatMap(DateTime.now, (now) =>
    Effect.flatMap(Effect.fromResult(checkedTiming(editing, now)), ({ at, cron, timeZone }) =>
      storage.editScheduledMessage(stored.id, { at, cron, text: asked.text ?? stored.text, timeZone }, isoTimeOf(now)),
    ),
  );
}

function previewOf(asked: Asked): Effect.Effect<readonly IsoTime[], Refusal> {
  return Effect.flatMap(DateTime.now, (now) => {
    const timing = Result.mapError(timingOf({ ...asked, now }), timingRefusal);
    return Effect.map(Effect.fromResult(timing), (timed) => {
      const from = isoTimeOf(now);
      return runsAfter({ count: scheduleTiming.shownRuns, now: from, timing: { ...timed, runsFrom: from } });
    });
  });
}

export { type EditRequest, editedIn, previewOf };

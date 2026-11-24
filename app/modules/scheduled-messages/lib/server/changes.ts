import { Caller, requireOwnerOrAdmin } from "../../../identities/server.ts";
import { DateTime, Effect, Predicate } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { ScheduledMessage, ScheduledMessageId } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import { creatorDeactivated, scheduledMessageNotFound } from "./refusals.ts";
import type { EditRequest } from "./edit.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage as StorageService } from "../../../storage/server.ts";
import { editedIn } from "./edit.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { shownWith } from "./shown.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type Change = "pauseScheduledMessage" | "resumeScheduledMessage" | "deleteScheduledMessage";

type Changing = (caller: Identity, id: ScheduledMessageId) => Fails<ScheduledMessage>;

type Editing = (caller: Identity, id: ScheduledMessageId, asked: EditRequest) => Fails<ScheduledMessage>;

interface ScheduledOn {
  readonly storage: Storage["Service"];
  readonly wake: Effect.Effect<void>;
}

function found(storage: Storage["Service"], scheduleId: ScheduledMessageId): Fails<StoredScheduledMessage> {
  return Effect.flatMap(storage.findScheduledMessage(scheduleId), (stored) =>
    Effect.mapError(Effect.fromNullishOr(stored), () => scheduledMessageNotFound(String(scheduleId))),
  );
}

function allowed(storage: Storage["Service"], caller: Identity, creator: IdentityName): Fails<void> {
  if (caller.name === creator) {
    return Effect.void;
  }
  return requireOwnerOrAdmin(creator).pipe(
    Effect.provideService(Caller, caller),
    Effect.provideService(StorageService, storage),
  );
}

function creatorActive(storage: Storage["Service"], creator: IdentityName): Fails<void> {
  return Effect.flatMap(storage.findIdentityByName(creator), (identity) =>
    Effect.when(
      Effect.fail(creatorDeactivated),
      Effect.succeed(Predicate.isNotUndefined(identity) && identity.deactivated === true),
    ),
  );
}

function changeWith(on: ScheduledOn, change: Change): Changing {
  return (caller, id) =>
    Effect.gen(function* changeSchedule() {
      const stored = yield* found(on.storage, id);
      yield* allowed(on.storage, caller, stored.creator);
      yield* Effect.when(
        creatorActive(on.storage, stored.creator),
        Effect.succeed(change === "resumeScheduledMessage"),
      );
      const now = yield* Effect.map(DateTime.now, isoTimeOf);
      const changed = yield* on.storage[change](stored.id, now);
      yield* on.wake;
      return yield* shownWith(on.storage)({ ...stored, ...changed });
    });
}

function editWith(on: ScheduledOn): Editing {
  return (caller, id, asked) =>
    Effect.gen(function* editSchedule() {
      const stored = yield* found(on.storage, id);
      yield* allowed(on.storage, caller, stored.creator);
      const edited = yield* editedIn({ asked, storage: on.storage, stored });
      yield* on.wake;
      return yield* shownWith(on.storage)({ ...stored, ...edited });
    });
}

interface Changes {
  readonly get: (id: ScheduledMessageId) => Fails<ScheduledMessage>;
  readonly edit: Editing;
  readonly pause: Changing;
  readonly resume: Changing;
  readonly remove: Changing;
}

function changesOn(on: ScheduledOn): Changes {
  return {
    edit: editWith(on),
    get: (id) => Effect.flatMap(found(on.storage, id), shownWith(on.storage)),
    pause: changeWith(on, "pauseScheduledMessage"),
    remove: changeWith(on, "deleteScheduledMessage"),
    resume: changeWith(on, "resumeScheduledMessage"),
  };
}

export { type Changes, type ScheduledOn, changesOn };

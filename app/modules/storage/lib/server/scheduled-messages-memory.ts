import { Array as Arr, Effect, Function as Fn, Option, Predicate, Ref } from "effect";
import type { MemoryBoard, StorageService } from "./service.ts";
import type { NewScheduledMessage, ScheduledRecords, StoredScheduledMessage } from "./scheduled-messages.ts";
import { pausedForDeactivation, scheduledMessagesOn } from "./scheduled-messages.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { ScheduledMessageId } from "../../../scheduled-messages/index.ts";
import type { Scope } from "effect";
import type { StorageUnavailable } from "./errors.ts";
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";
import { openMemoryState } from "./memory-state.ts";
import { openMemoryStorage } from "./memory.ts";

type Kept = StoredScheduledMessage & { readonly deleted: boolean };

type KeptList = readonly Kept[];

interface Schedules {
  readonly last: number;
  readonly kept: KeptList;
}

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface Keeping {
  readonly modify: <Value>(work: (data: Schedules) => readonly [Value, Schedules]) => Fails<Value>;
  readonly read: <Value>(work: (kept: KeptList) => Value) => Fails<Value>;
}

const NEXT = 1;
const NONE = 0;
const EMPTY: Schedules = { kept: [], last: NONE };

function asScheduledMessageId(value: number): ScheduledMessageId {
  return Option.getOrThrow(Option.liftPredicate(value, isScheduledMessageId));
}

function shown({ deleted: _deleted, ...schedule }: Kept): StoredScheduledMessage {
  return schedule;
}

function inserted(data: Schedules, schedule: NewScheduledMessage): readonly [StoredScheduledMessage, Schedules] {
  const stored: StoredScheduledMessage = {
    ...schedule,
    id: asScheduledMessageId(data.last + NEXT),
    lastRun: null,
    pausedBecause: null,
    runsFrom: schedule.createdAt,
    status: "active",
    updatedAt: schedule.createdAt,
  };
  return [stored, { kept: [...data.kept, { ...stored, deleted: false }], last: data.last + NEXT }];
}

function shownIn(kept: KeptList): KeptList {
  return Arr.filter(kept, (schedule) => !schedule.deleted);
}

function inChannel(channel: StoredScheduledMessage["channel"] | undefined): (kept: KeptList) => KeptList {
  return (kept) =>
    Arr.filter(shownIn(kept), (schedule) => Predicate.isUndefined(channel) || schedule.channel === channel);
}

function found(id: ScheduledMessageId): (kept: KeptList) => StoredScheduledMessage | undefined {
  return (kept) => {
    const match = Arr.findFirst(shownIn(kept), (one) => one.id === id);
    return Option.getOrUndefined(Option.map(match, shown));
  };
}

function changing(keeping: Keeping, work: (kept: KeptList) => KeptList): Fails<void> {
  return keeping.modify((data) => [NONE, { ...data, kept: work(data.kept) }]).pipe(Effect.asVoid);
}

function updating(id: ScheduledMessageId, work: (schedule: Kept) => Kept): (kept: KeptList) => KeptList {
  return (kept) =>
    Arr.map(kept, (schedule) => {
      if (schedule.id !== id) {
        return schedule;
      }
      return work(schedule);
    });
}

function memoryRecords(keeping: Keeping, board: MemoryBoard): ScheduledRecords {
  return {
    channelExists: (channel) => Effect.map(board.findChannel(channel), Predicate.isNotUndefined),
    find: (id) => keeping.read(found(id)),
    insert: (schedule) => keeping.modify((data) => inserted(data, schedule)),
    list: (channel) => keeping.read((kept) => Arr.map(inChannel(channel)(kept), shown)),
    markDeleted: (id) =>
      Effect.andThen(
        changing(
          keeping,
          updating(id, (schedule) => ({ ...schedule, deleted: true })),
        ),
        board.markMessagesOf(id),
      ),
    save: (schedule) =>
      changing(
        keeping,
        updating(schedule.id, (kept) => ({ ...schedule, deleted: kept.deleted })),
      ),
  };
}

function pausingOf(creator: IdentityName): (kept: KeptList) => KeptList {
  return (kept) =>
    Arr.map(kept, (schedule) => {
      if (schedule.creator !== creator) {
        return schedule;
      }
      return { ...pausedForDeactivation(schedule), deleted: schedule.deleted };
    });
}

function dropping(drop: (schedule: Kept) => boolean): (kept: KeptList) => KeptList {
  return (kept) => Arr.filter(kept, (schedule) => !drop(schedule));
}

function withSchedules(keeping: Keeping, board: MemoryBoard): StorageService {
  const { markMessagesOf: _markMessagesOf, ...storage } = board;
  return {
    ...storage,
    ...scheduledMessagesOn({
      appendMessage: board.appendMessage,
      atomically: Fn.identity,
      records: memoryRecords(keeping, board),
    }),
    deactivateIdentity: (name) =>
      Effect.tap(board.deactivateIdentity(name), ({ status }) =>
        Effect.when(changing(keeping, pausingOf(name)), Effect.succeed(status === "deactivated")),
      ),
    deleteChannel: (name) =>
      Effect.tap(board.deleteChannel(name), (channel) =>
        Effect.when(
          changing(
            keeping,
            dropping((schedule) => schedule.channel === name),
          ),
          Effect.succeed(Predicate.isNotUndefined(channel)),
        ),
      ),
    deleteIdentity: (name) =>
      Effect.tap(board.deleteIdentity(name), ({ status }) =>
        Effect.when(
          changing(
            keeping,
            dropping((schedule) => schedule.creator === name),
          ),
          Effect.succeed(status === "deleted"),
        ),
      ),
  };
}

const openMemorySchedules: Effect.Effect<StorageService, never, Scope.Scope> = Effect.gen(function* openSchedules() {
  const board = yield* openMemoryStorage;
  const state = yield* openMemoryState;
  const ref = yield* Ref.make(EMPTY);
  const keeping: Keeping = {
    modify: (work) => Effect.andThen(state.ensureOpen, Ref.modify(ref, work)),
    read: (work) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.map(Ref.get(ref), ({ kept }) => work(kept)),
      ),
  };
  return withSchedules(keeping, board);
});

export { openMemorySchedules };

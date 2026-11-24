import type { AppendMessageResult, MessagesSection, NewMessage } from "./messages.ts";
import { Effect, Predicate } from "effect";
import type {
  ScheduledMessageId,
  ScheduledMessagePauseReason,
  ScheduledMessageStatus,
  ScheduledRunOutcome,
} from "../../../scheduled-messages/index.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { StorageUnavailable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredScheduledRun {
  readonly due: IsoTime;
  readonly outcome: ScheduledRunOutcome;
  readonly messageId: MessageId | null;
}

interface StoredScheduledMessage {
  readonly id: ScheduledMessageId;
  readonly channel: ChannelName;
  readonly creator: IdentityName;
  readonly text: string;
  readonly cron: string | null;
  readonly at: IsoTime | null;
  readonly timeZone: string;
  readonly status: ScheduledMessageStatus;
  readonly pausedBecause: ScheduledMessagePauseReason | null;
  readonly runsFrom: IsoTime;
  readonly lastRun: StoredScheduledRun | null;
  readonly createdAt: IsoTime;
  readonly updatedAt: IsoTime;
}

type NewScheduledMessage = Pick<
  StoredScheduledMessage,
  "channel" | "creator" | "text" | "cron" | "at" | "timeZone" | "createdAt"
>;

type ScheduledEdit = Pick<StoredScheduledMessage, "text" | "cron" | "at" | "timeZone">;

interface ScheduledRun {
  readonly id: ScheduledMessageId;
  readonly runsFrom: IsoTime;
  readonly due: IsoTime;
  readonly finished: boolean;
  readonly message?: NewMessage;
}

type ScheduledRunResult = AppendMessageResult | { readonly status: "skipped" } | { readonly status: "run_moved" };

type Found = StoredScheduledMessage | undefined;

interface ScheduledMessagesSection {
  readonly createScheduledMessage: (schedule: NewScheduledMessage) => Fails<Found>;
  readonly findScheduledMessage: (id: ScheduledMessageId) => Fails<Found>;
  readonly listScheduledMessages: (channel?: ChannelName) => Fails<readonly StoredScheduledMessage[]>;
  readonly pauseScheduledMessage: (id: ScheduledMessageId, at: IsoTime) => Fails<Found>;
  readonly resumeScheduledMessage: (id: ScheduledMessageId, at: IsoTime) => Fails<Found>;
  readonly editScheduledMessage: (id: ScheduledMessageId, edit: ScheduledEdit, at: IsoTime) => Fails<Found>;
  readonly deleteScheduledMessage: (id: ScheduledMessageId, at: IsoTime) => Fails<Found>;
  readonly runScheduledMessage: (run: ScheduledRun) => Fails<ScheduledRunResult>;
}

interface ScheduleMarking {
  readonly markMessagesOf: (schedule: ScheduledMessageId) => Fails<void>;
}

interface ScheduledRecords {
  readonly insert: (schedule: NewScheduledMessage) => Fails<StoredScheduledMessage>;
  readonly find: (id: ScheduledMessageId) => Fails<Found>;
  readonly list: (channel?: ChannelName) => Fails<readonly StoredScheduledMessage[]>;
  readonly save: (schedule: StoredScheduledMessage) => Fails<void>;
  readonly markDeleted: (id: ScheduledMessageId, at: IsoTime) => Fails<void>;
  readonly channelExists: (channel: ChannelName) => Fails<boolean>;
}

interface ScheduledMessagesOn {
  readonly records: ScheduledRecords;
  readonly appendMessage: MessagesSection["appendMessage"];
  readonly atomically: <Value, Failure>(
    work: Effect.Effect<Value, Failure>,
  ) => Effect.Effect<Value, Failure | StorageUnavailable>;
}

interface Running {
  readonly on: ScheduledMessagesOn;
  readonly schedule: StoredScheduledMessage;
  readonly run: ScheduledRun;
}

type Change = (schedule: StoredScheduledMessage, at: IsoTime) => StoredScheduledMessage;

const PAUSE_SCHEDULES_OF = `UPDATE scheduled_messages SET status = 'paused', paused_because = 'creator_deactivated'
  WHERE creator = ? AND status = 'active'`;

const RUN_MOVED = { status: "run_moved" } as const;
const SKIPPED = { status: "skipped" } as const;

function paused(schedule: StoredScheduledMessage, at: IsoTime): StoredScheduledMessage {
  if (schedule.status !== "active") {
    return schedule;
  }
  return { ...schedule, pausedBecause: null, status: "paused", updatedAt: at };
}

function resumed(schedule: StoredScheduledMessage, at: IsoTime): StoredScheduledMessage {
  if (schedule.status !== "paused") {
    return schedule;
  }
  return { ...schedule, pausedBecause: null, runsFrom: at, status: "active", updatedAt: at };
}

function retimed(schedule: StoredScheduledMessage, edit: ScheduledEdit): boolean {
  return schedule.cron !== edit.cron || schedule.at !== edit.at || schedule.timeZone !== edit.timeZone;
}

function statusAfterEdit(schedule: StoredScheduledMessage, edit: ScheduledEdit): ScheduledMessageStatus {
  if (schedule.status === "finished" && retimed(schedule, edit)) {
    return "active";
  }
  return schedule.status;
}

function editedTo(edit: ScheduledEdit): Change {
  return (schedule, at) => ({
    ...schedule,
    ...edit,
    runsFrom: at,
    status: statusAfterEdit(schedule, edit),
    updatedAt: at,
  });
}

function pausedForDeactivation(schedule: StoredScheduledMessage): StoredScheduledMessage {
  if (schedule.status !== "active") {
    return schedule;
  }
  return { ...schedule, pausedBecause: "creator_deactivated", status: "paused" };
}

function outcomeOf(messageId: MessageId | null): ScheduledRunOutcome {
  if (messageId === null) {
    return "skipped";
  }
  return "posted";
}

function statusAfter(schedule: StoredScheduledMessage, run: ScheduledRun): ScheduledMessageStatus {
  if (run.finished) {
    return "finished";
  }
  return schedule.status;
}

function ran({ run, schedule }: Omit<Running, "on">, messageId: MessageId | null): StoredScheduledMessage {
  const lastRun = { due: run.due, messageId, outcome: outcomeOf(messageId) };
  return { ...schedule, lastRun, runsFrom: run.due, status: statusAfter(schedule, run) };
}

function stillDue(schedule: Found, run: ScheduledRun): schedule is StoredScheduledMessage {
  return Predicate.isNotUndefined(schedule) && schedule.status === "active" && schedule.runsFrom === run.runsFrom;
}

function changeWith(on: ScheduledMessagesOn, change: Change): (id: ScheduledMessageId, at: IsoTime) => Fails<Found> {
  return (id, at) =>
    on.atomically(
      Effect.flatMap(on.records.find(id), (found) => {
        if (Predicate.isUndefined(found)) {
          return Effect.undefined;
        }
        const changed = change(found, at);
        return Effect.as(on.records.save(changed), changed);
      }),
    );
}

function postRun(running: Running, message: NewMessage): Fails<ScheduledRunResult> {
  const { on, schedule } = running;
  const marked: NewMessage = { ...message, scheduledMessage: { deleted: false, id: schedule.id } };
  return Effect.tap(on.appendMessage(marked), (result) => {
    if (result.status !== "appended") {
      return Effect.void;
    }
    return on.records.save(ran(running, result.message.id));
  });
}

function runWith(on: ScheduledMessagesOn): ScheduledMessagesSection["runScheduledMessage"] {
  return (run) =>
    on.atomically(
      Effect.flatMap(on.records.find(run.id), (found): Fails<ScheduledRunResult> => {
        if (!stillDue(found, run)) {
          return Effect.succeed(RUN_MOVED);
        }
        if (Predicate.isUndefined(run.message)) {
          return Effect.as(on.records.save(ran({ run, schedule: found }, null)), SKIPPED);
        }
        return postRun({ on, run, schedule: found }, run.message);
      }),
    );
}

function deleteWith(on: ScheduledMessagesOn): ScheduledMessagesSection["deleteScheduledMessage"] {
  return (id, at) =>
    on.atomically(
      Effect.tap(on.records.find(id), (found) =>
        Effect.when(on.records.markDeleted(id, at), Effect.succeed(Predicate.isNotUndefined(found))),
      ),
    );
}

function scheduledMessagesOn(on: ScheduledMessagesOn): ScheduledMessagesSection {
  return {
    createScheduledMessage: (schedule) =>
      on.atomically(
        Effect.flatMap(on.records.channelExists(schedule.channel), (exists) => {
          if (!exists) {
            return Effect.undefined;
          }
          return on.records.insert(schedule);
        }),
      ),
    deleteScheduledMessage: deleteWith(on),
    editScheduledMessage: (id, edit, at) => changeWith(on, editedTo(edit))(id, at),
    findScheduledMessage: on.records.find,
    listScheduledMessages: on.records.list,
    pauseScheduledMessage: changeWith(on, paused),
    resumeScheduledMessage: changeWith(on, resumed),
    runScheduledMessage: runWith(on),
  };
}

export {
  PAUSE_SCHEDULES_OF,
  type NewScheduledMessage,
  type ScheduleMarking,
  type ScheduledMessagesSection,
  type ScheduledRecords,
  type ScheduledRun,
  type StoredScheduledMessage,
  pausedForDeactivation,
  scheduledMessagesOn,
};

/**
 * Scheduled messages on the wire, shared by the server, the SDK and the web: a Scheduled message as the server shows
 * it, the requests and answers of its routes, their paths, the timing rules and the codes they refuse with. A
 * Scheduled message is a stored schedule that posts an ordinary top-level message into a channel at set times, as the
 * identity that created it (Matt, 2026-11-24, mattpocock/cookout#386).
 */
import type { Author, MessageId, ScheduledMessageMarker } from "../messages/index.ts";
import type { ChannelName } from "../channels/index.ts";
import type { IsoTime } from "../time/index.ts";

const LOWEST_ID = 1;

export type { ScheduledMessageMarker } from "../messages/index.ts";
export { messageErrorCodes } from "../messages/index.ts";

/** A Scheduled message's ID: a positive whole number, from its own sequence. */
export type ScheduledMessageId = ScheduledMessageMarker["id"];

/**
 * Whether `value` is a positive whole number; if so, it is a `ScheduledMessageId`.
 * @param value The number to check.
 * @returns Whether `value` is a `ScheduledMessageId`.
 */
export function isScheduledMessageId(value: number): value is ScheduledMessageId {
  return Number.isSafeInteger(value) && value >= LOWEST_ID;
}

/**
 * The timing rules: a schedule runs at most once every `minimumMinutes` (Matt, 2026-11-24, msg 3118), a run missed
 * while the board was down posts only if it is under `lateMinutes` late (msg 3108), and a schedule shows its next
 * `shownRuns` runs.
 */
export const scheduleTiming = { lateMinutes: 10, minimumMinutes: 30, shownRuns: 3 } as const;

/** Whether a schedule runs: `active`, `paused`, or `finished` once a one-off schedule's run is handled. */
export const scheduledMessageStatuses = ["active", "paused", "finished"] as const;

/** A schedule's status. */
export type ScheduledMessageStatus = (typeof scheduledMessageStatuses)[number];

/** Why a schedule was paused for its creator rather than by them: its creator was Deactivated. */
export const scheduledMessagePauseReasons = ["creator_deactivated"] as const;

/** The reason a schedule was paused, when it wasn't paused by hand. */
export type ScheduledMessagePauseReason = (typeof scheduledMessagePauseReasons)[number];

/** What a handled run did: posted its message, or was skipped as 10 minutes or more late. */
export const scheduledRunOutcomes = ["posted", "skipped"] as const;

/** The outcome of a handled run. */
export type ScheduledRunOutcome = (typeof scheduledRunOutcomes)[number];

/** The latest run a schedule handled. */
export interface ScheduledMessageRun {
  /** The moment the run was due. */
  readonly due: IsoTime;
  readonly outcome: ScheduledRunOutcome;
  /** The message it posted. Absent when it was skipped. */
  readonly messageId?: MessageId;
}

/** A Scheduled message as the server shows it. It has exactly one of `cron` and `at`. */
export interface ScheduledMessage {
  readonly id: ScheduledMessageId;
  readonly channel: ChannelName;
  /** Who created it, and whom each post is written as. */
  readonly creator: Author;
  readonly text: string;
  /** A 5-field cron expression, read in `timeZone`. Absent on a one-off schedule. */
  readonly cron?: string;
  /** The one moment a one-off schedule posts. Absent on a recurring schedule. */
  readonly at?: IsoTime;
  /** The IANA time zone the cron expression is read in, such as `Europe/London`. */
  readonly timeZone: string;
  readonly status: ScheduledMessageStatus;
  /** Present while it is paused because its creator was Deactivated. */
  readonly pausedBecause?: ScheduledMessagePauseReason;
  /** Its next runs, at most `scheduleTiming.shownRuns`, soonest first. Empty while it is paused or finished. */
  readonly nextRuns: readonly IsoTime[];
  /** The latest run it handled. Absent before its first. */
  readonly lastRun?: ScheduledMessageRun;
  readonly createdAt: IsoTime;
  readonly updatedAt: IsoTime;
}

/**
 * The body of `POST /v1/scheduled-messages`: a channel, a text, exactly one of `cron` and `at`, and a time zone. An
 * `at` with no offset is read in `timeZone`.
 */
export interface CreateScheduledMessageRequest {
  readonly channel: string;
  readonly text: string;
  readonly cron?: string;
  /** An ISO 8601 date and time, such as `2026-12-01T09:00` or `2026-12-01T09:00:00Z`. */
  readonly at?: string;
  readonly timeZone: string;
}

/**
 * The body of `PATCH /v1/scheduled-messages/:id`: what to change. Giving `cron` or `at` replaces the timing; giving
 * only `timeZone` reads the current timing in it. The channel can't change.
 */
export interface EditScheduledMessageRequest {
  readonly text?: string;
  readonly cron?: string;
  /** An ISO 8601 date and time, read in `timeZone` (or the current one) when it has no offset. */
  readonly at?: string;
  readonly timeZone?: string;
}

/** The query of `GET /v1/scheduled-messages/preview`: exactly one of `cron` and `at`, and a time zone. */
export interface PreviewScheduledMessageQuery {
  readonly cron?: string;
  readonly at?: string;
  readonly timeZone: string;
}

/** The answer to `GET /v1/scheduled-messages/preview`: the next runs a schedule with that timing would have. */
export interface ScheduledMessagePreviewResponse {
  /** At most `scheduleTiming.shownRuns`, soonest first. */
  readonly nextRuns: readonly IsoTime[];
}

/** The query of `GET /v1/scheduled-messages`: only one channel's schedules. */
export interface ListScheduledMessagesQuery {
  readonly channel?: string;
}

/** The answer to creating, getting, editing, pausing, resuming or deleting a Scheduled message. */
export interface ScheduledMessageResponse {
  readonly scheduledMessage: ScheduledMessage;
}

/** The answer to `GET /v1/scheduled-messages`: every schedule asked for, oldest first. */
export interface ListScheduledMessagesResponse {
  readonly scheduledMessages: readonly ScheduledMessage[];
}

/** `POST` creates a Scheduled message, for any identity; `GET` lists them, for any identity. */
export const scheduledMessagesPath = "/v1/scheduled-messages";

/** `GET` answers the next runs of a cron or `at` in a time zone, or the refusal create would give. */
export const scheduledMessagePreviewPath = "/v1/scheduled-messages/preview";

/** `GET` shows one Scheduled message; `PATCH` edits it, changing its future runs only; `DELETE` deletes it. */
export const scheduledMessagePath = "/v1/scheduled-messages/:id";

/** `POST` pauses a Scheduled message. */
export const scheduledMessagePausePath = "/v1/scheduled-messages/:id/pause";

/** `POST` resumes a paused Scheduled message. */
export const scheduledMessageResumePath = "/v1/scheduled-messages/:id/resume";

/**
 * The codes the Scheduled message routes refuse with: a bad, too frequent or never-running cron expression, an
 * unknown or unnamed time zone and an `at` in the past (400), neither or both of `cron` and `at` (400), a missing
 * schedule (404), and resuming one whose creator is still Deactivated (409).
 */
export const scheduledMessageErrorCodes = [
  "cron_invalid",
  "cron_too_frequent",
  "cron_never_runs",
  "time_zone_invalid",
  "at_in_past",
  "cron_or_at",
  "scheduled_message_not_found",
  "creator_deactivated",
] as const;

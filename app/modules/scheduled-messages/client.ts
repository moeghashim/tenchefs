/**
 * The calls a client makes on Scheduled messages (#387, #389): create, list, get, edit, preview, pause, resume and
 * delete. The SDK's
 * `CookoutClient` has them.
 */
import type {
  CreateScheduledMessageRequest,
  EditScheduledMessageRequest,
  ListScheduledMessagesQuery,
  ListScheduledMessagesResponse,
  PreviewScheduledMessageQuery,
  ScheduledMessageId,
  ScheduledMessagePreviewResponse,
  ScheduledMessageResponse,
} from "./index.ts";

/** Creating, reading and changing Scheduled messages. */
export interface ScheduledMessageCalls {
  /**
   * `POST /v1/scheduled-messages`: schedules `text` to post in `channel` as the caller, on a 5-field `cron` read in
   * `timeZone`, or once `at` a moment. Refused with 400 `cron_invalid`, `cron_too_frequent` (more often than every 30
   * minutes), `cron_never_runs`, `time_zone_invalid`, `at_in_past` or `cron_or_at`, and 404 `channel_not_found`.
   */
  readonly createScheduledMessage: (request: CreateScheduledMessageRequest) => Promise<ScheduledMessageResponse>;
  /** `GET /v1/scheduled-messages`: every Scheduled message, or one channel's, oldest first. */
  readonly listScheduledMessages: (query?: ListScheduledMessagesQuery) => Promise<ListScheduledMessagesResponse>;
  /** `GET /v1/scheduled-messages/:id`. A missing one is 404 `scheduled_message_not_found`. */
  readonly getScheduledMessage: (id: ScheduledMessageId) => Promise<ScheduledMessageResponse>;
  /**
   * `PATCH /v1/scheduled-messages/:id`: changes its text, its cron or `at`, or its time zone, for its future runs only:
   * its next run counts from now, and what it already posted stays. A finished one-off schedule given a future `at` or
   * a cron runs again. Refused as create refuses, and 403 `not_owner` for anyone but its creator, an agent creator's
   * owner or an admin.
   */
  readonly editScheduledMessage: (
    id: ScheduledMessageId,
    request: EditScheduledMessageRequest,
  ) => Promise<ScheduledMessageResponse>;
  /**
   * `GET /v1/scheduled-messages/preview`: the next 3 runs a schedule with this cron or `at` and time zone would have,
   * or the refusal create would give.
   */
  readonly previewScheduledMessage: (query: PreviewScheduledMessageQuery) => Promise<ScheduledMessagePreviewResponse>;
  /** `POST /v1/scheduled-messages/:id/pause`: its creator, an agent creator's owner or an admin (403 `not_owner`). */
  readonly pauseScheduledMessage: (id: ScheduledMessageId) => Promise<ScheduledMessageResponse>;
  /**
   * `POST /v1/scheduled-messages/:id/resume`: it runs from now on, and runs missed while it was paused are not caught
   * up. 409 `creator_deactivated` while its creator is Deactivated.
   */
  readonly resumeScheduledMessage: (id: ScheduledMessageId) => Promise<ScheduledMessageResponse>;
  /** `DELETE /v1/scheduled-messages/:id`: stops it. The messages it posted stay, marked as from a deleted schedule. */
  readonly deleteScheduledMessage: (id: ScheduledMessageId) => Promise<ScheduledMessageResponse>;
}

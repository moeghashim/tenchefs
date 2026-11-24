import { Effect, Option } from "effect";
import type { Refusal } from "../../../http/index.ts";
import type { Refused } from "./timing.ts";
import type { ScheduledMessageId } from "../../index.ts";
import { echoed } from "../../../http/index.ts";
import { isScheduledMessageId } from "../../index.ts";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;

const timingRefusals: Readonly<Record<Refused, Refusal>> = {
  at_in_past: { code: "at_in_past", message: "The at time has already passed.", status: BAD_REQUEST },
  at_invalid: {
    code: "invalid_request",
    message: "The at time is not an ISO 8601 date and time, such as 2026-12-01T09:00.",
    status: BAD_REQUEST,
  },
  cron_invalid: {
    code: "cron_invalid",
    message: "The cron expression is not five fields: minute, hour, day of month, month and day of week.",
    status: BAD_REQUEST,
  },
  cron_never_runs: { code: "cron_never_runs", message: "The cron expression never runs.", status: BAD_REQUEST },
  cron_or_at: {
    code: "cron_or_at",
    message: "A Scheduled message needs exactly one of cron and at.",
    status: BAD_REQUEST,
  },
  cron_too_frequent: {
    code: "cron_too_frequent",
    message: "A Scheduled message runs at most once every 30 minutes.",
    status: BAD_REQUEST,
  },
  time_zone_invalid: {
    code: "time_zone_invalid",
    message: "The time zone is not an IANA time zone name, such as Europe/London.",
    status: BAD_REQUEST,
  },
};

function timingRefusal(refused: Refused): Refusal {
  return timingRefusals[refused];
}

function scheduledMessageNotFound(raw: string): Refusal {
  return {
    code: "scheduled_message_not_found",
    message: `No Scheduled message ${echoed(raw)}.`,
    status: NOT_FOUND,
  };
}

const creatorDeactivated: Refusal = {
  code: "creator_deactivated",
  message: "The Scheduled message's creator is Deactivated; reactivate them first.",
  status: CONFLICT,
};

function scheduledMessageIdOf(raw: string): Effect.Effect<ScheduledMessageId, Refusal> {
  const id = Option.liftPredicate(Number(raw), isScheduledMessageId);
  return Effect.mapError(Effect.fromOption(id), () => scheduledMessageNotFound(raw));
}

export { creatorDeactivated, scheduledMessageIdOf, scheduledMessageNotFound, timingRefusal };

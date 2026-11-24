import type { Refusal } from "../../sdk/index.ts";
import { scheduleTiming } from "../../scheduled-messages/index.ts";

const WORDS: Readonly<Partial<Record<Refusal["code"], string>>> = {
  at_in_past: "That time has already passed.",
  cron_invalid: "That isn't a 5-field cron expression (minute, hour, day of month, month, weekday).",
  cron_never_runs: "That cron expression never runs.",
  cron_too_frequent: `That runs more often than every ${String(scheduleTiming.minimumMinutes)} minutes.`,
  time_zone_invalid: "That isn't a time zone the board knows, such as Europe/London.",
};

export function refusalWords(refusal: Refusal): string {
  return WORDS[refusal.code] ?? `${refusal.message} (${refusal.code})`;
}

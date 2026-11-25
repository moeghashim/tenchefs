import type { Identity } from "../../sdk/index.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { cronWords } from "../../board/index.ts";
import { runTimeIn } from "../../format/index.ts";

const FIRST = 0;

const TEXT = {
  creatorDeactivated: "Paused: its creator was deactivated",
  finished: "Finished",
  noNext: "No next run",
  paused: "Paused",
} as const;

function timingWords(schedule: ScheduledMessage): string {
  const { cron, timeZone } = schedule;
  const at = schedule.at ?? null;
  if (at !== null) {
    return `Once, at ${runTimeIn({ iso: at, timeZone })}`;
  }
  const raw = cron ?? "";
  const words = cronWords(raw);
  if (words === null) {
    return `Cron ${raw}`;
  }
  return `${words} (${raw})`;
}

function nextRunWords(schedule: ScheduledMessage): string {
  const next = schedule.nextRuns[FIRST] ?? null;
  if (next === null) {
    return `${TEXT.noNext} · ${schedule.timeZone}`;
  }
  return `Next run ${runTimeIn({ iso: next, timeZone: schedule.timeZone })} · ${schedule.timeZone}`;
}

function stateWords(schedule: ScheduledMessage): string | null {
  if (schedule.status === "finished") {
    return TEXT.finished;
  }
  if (schedule.status !== "paused") {
    return null;
  }
  if (schedule.pausedBecause === "creator_deactivated") {
    return TEXT.creatorDeactivated;
  }
  return TEXT.paused;
}

interface Changing {
  readonly schedule: ScheduledMessage;
  readonly me: Identity;
}

function mayChange({ me, schedule }: Changing): boolean {
  const { creator } = schedule;
  return me.admin || creator.name === me.name || creator.owner === me.name;
}

export { mayChange, nextRunWords, stateWords, timingWords };

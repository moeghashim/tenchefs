/**
 * The web UI's formats: how it writes a time for a person, in their own time
 * zone. `timeOf(iso)` is a message's short time (`2:14 PM`), its full date
 * and time for a hover, and the ISO time itself. `dayLabel(iso)` names the
 * day for a separator: `Today`, `Yesterday`, or the weekday and date
 * (`Monday, 23 November`). `dayOf(iso)` is the local day a time falls on, and
 * `millisOf(iso)` its milliseconds, to tell how far apart two times are, and
 * `isPast(iso)` whether the current time has reached it.
 * `timeAgo(iso)` is how long ago a time was (`5 minutes ago`), by the current
 * time, and from a day on its date and time (`Yesterday 14:05`);
 * `everySecond(listener)` ticks it live. A `Clock`'s `after(millis, listener)`
 * calls back once that much time has passed, unless the function it returns
 * is called first: `browserClock` waits on the page's timers, and tests bring
 * a clock they move on by hand, so time on screen passes without waiting.
 * `browserTimeZone()` is the browser's own IANA time zone, and
 * `runTimeIn({ iso, timeZone })` writes a Scheduled message's run in the zone it
 * is scheduled in (`Mon, 1 Dec 2026, 09:00`).
 * `recentDays()` is today, yesterday, a week ago and a month ago (the same day of the month before, or its last day
 * if it has fewer), each as its local `YYYY-MM-DD` and named, for the search box's date filters.
 * This is the web UI's one reader of `Date` and its one clock.
 */
const DAY = 1;
const SECOND = 1000;
const TEN_SECONDS = 10;
const SECONDS_IN_MINUTE = 60;
const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = 1440;
const ONE = 1;
const WEEK_DAYS = 7;
const NO_DAY = 0;

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const isoDay = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", year: "numeric" });
const hourMinute = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit" });

const TEXT = {
  justNow: "just now",
  today: "Today",
  yesterday: "Yesterday",
} as const;

function counted(count: number, unit: string): string {
  if (count === ONE) {
    return `1 ${unit} ago`;
  }
  return `${String(count)} ${unit}s ago`;
}

function dated(at: Date): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - DAY);
  if (at.toDateString() === yesterday.toDateString()) {
    return `${TEXT.yesterday} ${hourMinute.format(at)}`;
  }
  return `${dayMonth.format(at)} ${hourMinute.format(at)}`;
}

function minutesAgo(minutes: number, at: Date): string {
  if (minutes < MINUTES_IN_HOUR) {
    return counted(minutes, "minute");
  }
  if (minutes < MINUTES_IN_DAY) {
    return counted(Math.floor(minutes / MINUTES_IN_HOUR), "hour");
  }
  return dated(at);
}

/** A message's time three ways: the ISO time, a short time to show, and the full date and time for a hover. */
export interface MessageTime {
  readonly iso: string;
  readonly short: string;
  readonly full: string;
}

/**
 * A time as a message shows it.
 * @param iso The ISO time.
 * @returns Its short and full forms, in the local time zone.
 */
export function timeOf(iso: string): MessageTime {
  const at = new Date(iso);
  return { full: full.format(at), iso, short: clock.format(at) };
}

/**
 * The local day a time falls on, to tell whether two times share one.
 * @param iso The ISO time.
 * @returns The day, the same string for every time on it.
 */
export function dayOf(iso: string): string {
  return new Date(iso).toDateString();
}

/**
 * A time as milliseconds since the epoch, to tell how far apart two times are.
 * @param iso The ISO time.
 * @returns Its milliseconds.
 */
export function millisOf(iso: string): number {
  return Date.parse(iso);
}

/**
 * Whether a time has come, by the current time, such as an agent session's expiry.
 * @param iso The ISO time.
 * @returns `true` once the current time reaches it.
 */
export function isPast(iso: string): boolean {
  return Date.parse(iso) <= Date.now();
}

/**
 * The label of a day separator.
 * @param iso Any time on the day.
 * @returns `Today`, `Yesterday`, or the weekday and date.
 */
export function dayLabel(iso: string): string {
  const day = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - DAY);
  if (day.toDateString() === new Date().toDateString()) {
    return TEXT.today;
  }
  if (day.toDateString() === yesterday.toDateString()) {
    return TEXT.yesterday;
  }
  return `${weekday.format(day)}, ${date.format(day)}`;
}

/**
 * How long ago a time was, by the current time: in tens of seconds, then
 * whole minutes and hours, and from a day on as its date and time.
 * @param iso The ISO time.
 * @returns `just now`, `10 seconds ago`, `1 minute ago`, `5 minutes ago`,
 * `2 hours ago`, `Yesterday 14:05` or `21 Nov 14:05`.
 */
export function timeAgo(iso: string): string {
  const at = new Date(iso);
  const seconds = Math.floor((Date.now() - at.getTime()) / SECOND);
  if (seconds < TEN_SECONDS) {
    return TEXT.justNow;
  }
  if (seconds < SECONDS_IN_MINUTE) {
    return `${String(Math.floor(seconds / TEN_SECONDS) * TEN_SECONDS)} seconds ago`;
  }
  return minutesAgo(Math.floor(seconds / SECONDS_IN_MINUTE), at);
}

/** A recent day, as its local `YYYY-MM-DD` and its name. */
export interface RecentDay {
  readonly label: string;
  readonly date: string;
}

/**
 * Today, yesterday, a week ago and a month ago, by the current time in the person's own time zone.
 * @returns The four days, today first.
 */
export function recentDays(): readonly RecentDay[] {
  const now = new Date();
  const [year, month, today] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const lastOfMonthBefore = new Date(year, month, NO_DAY).getDate();
  return [
    { date: isoDay.format(now), label: "Today" },
    { date: isoDay.format(new Date(year, month, today - DAY)), label: "Yesterday" },
    { date: isoDay.format(new Date(year, month, today - WEEK_DAYS)), label: "A week ago" },
    { date: isoDay.format(new Date(year, month - ONE, Math.min(today, lastOfMonthBefore))), label: "A month ago" },
  ];
}

/**
 * Calls `listener` every second, so a time shown as how long ago ticks live.
 * @param listener What to call.
 * @returns The function that stops the calls.
 */
export function everySecond(listener: () => void): () => void {
  const ticking = setInterval(listener, SECOND);
  return () => {
    clearInterval(ticking);
  };
}

/**
 * The browser's own time zone, which a Scheduled message is read in unless another is chosen.
 * @returns Its IANA name, such as `Europe/London`.
 */
export function browserTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A Scheduled message's run, and the zone it is scheduled in. */
export interface RunTime {
  readonly iso: string;
  readonly timeZone: string;
}

/**
 * A Scheduled message's run as the zone it is scheduled in shows it.
 * @param run The run's ISO time, and the IANA time zone to write it in, one the server has accepted.
 * @returns Its weekday, date and 24-hour time, such as `Mon, 1 Dec 2026, 09:00`.
 */
export function runTimeIn(run: RunTime): string {
  const { iso, timeZone } = run;
  const shape = {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    weekday: "short",
    year: "numeric",
  } as const;
  return new Intl.DateTimeFormat("en-GB", { ...shape, timeZone }).format(new Date(iso));
}

export { runPartsIn } from "./lib/run-parts.ts";
export { type Clock, browserClock } from "./lib/browser-clock.ts";

import { Array as Arr, Cron, DateTime, Option, Order, Predicate, Result, String as Str } from "effect";
import type { IsoTime } from "../../../time/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { scheduleTiming } from "../../index.ts";

type Refused =
  | "cron_invalid"
  | "cron_too_frequent"
  | "cron_never_runs"
  | "time_zone_invalid"
  | "at_in_past"
  | "cron_or_at"
  | "at_invalid";

interface Asked {
  readonly cron?: string;
  readonly at?: string;
  readonly timeZone: string;
}

interface Timed {
  readonly cron: string | null;
  readonly at: IsoTime | null;
  readonly timeZone: string;
}

type Timing = Timed & { readonly runsFrom: IsoTime };

interface AtMoment {
  readonly timing: Timing;
  readonly now: IsoTime;
}

interface DayWalk {
  readonly runs: boolean;
  readonly onConsecutiveDays: boolean;
}

const CRON_FIELDS = 5;
const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = MINUTES_IN_HOUR * HOURS_IN_DAY;
const DAYS_WALKED = 2930;
const MS_IN_MINUTE = 60_000;
const MS_IN_DAY = MS_IN_MINUTE * MINUTES_IN_DAY;
const WALK_START = DateTime.toEpochMillis(DateTime.makeUnsafe("2024-01-01T00:00:00.000Z"));
const JUST_AFTER = 1;
const NONE = 0;
const NEXT = 1;
const NEVER = Number.POSITIVE_INFINITY;
const ZONE_NAME = /^[A-Za-z]/u;
const HAS_OFFSET = /(?:Z|[+-]\d\d:?\d\d)$/u;
const FIELD_GAP = /\s+/u;

function millisOf(time: IsoTime): number {
  return DateTime.toEpochMillis(DateTime.makeUnsafe(time));
}

function isoAt(millis: number): IsoTime {
  return isoTimeOf(DateTime.makeUnsafe(millis));
}

function everyOr(set: ReadonlySet<number>, size: number): Arr.NonEmptyReadonlyArray<number> {
  return Arr.match(Arr.sort(set, Order.Number), {
    onEmpty: () => Arr.makeBy(size, (index) => index),
    onNonEmpty: (sorted: Arr.NonEmptyReadonlyArray<number>) => sorted,
  });
}

function timesOfDay(cron: Cron.Cron): Arr.NonEmptyReadonlyArray<number> {
  const minutes = everyOr(cron.minutes, MINUTES_IN_HOUR);
  return Arr.flatMap(everyOr(cron.hours, HOURS_IN_DAY), (hour) =>
    Arr.map(minutes, (minute) => hour * MINUTES_IN_HOUR + minute),
  );
}

function shortestInDay(times: Arr.NonEmptyReadonlyArray<number>): number {
  const gaps = Arr.zipWith(Arr.drop(times, NEXT), times, (time, previous) => time - previous);
  return Math.min(NEVER, ...gaps);
}

function walkDays(cron: Cron.Cron, firstTime: number): DayWalk {
  const matches = Arr.makeBy(DAYS_WALKED, (day) =>
    Cron.match(cron, WALK_START + day * MS_IN_DAY + firstTime * MS_IN_MINUTE),
  );
  return {
    onConsecutiveDays: Arr.some(Arr.drop(matches, NEXT), (matched, index) => matched && matches[index] === true),
    runs: Arr.some(matches, Predicate.isTruthy),
  };
}

function acrossMidnight(walk: DayWalk, times: Arr.NonEmptyReadonlyArray<number>): number {
  if (!walk.onConsecutiveDays) {
    return NEVER;
  }
  return MINUTES_IN_DAY - Arr.lastNonEmpty(times) + Arr.headNonEmpty(times);
}

function frequencyOf(expression: string): Result.Result<void, Refused> {
  const cron = Cron.parseUnsafe(expression, "UTC");
  const times = timesOfDay(cron);
  const walk = walkDays(cron, Arr.headNonEmpty(times));
  if (!walk.runs) {
    return Result.fail("cron_never_runs");
  }
  if (Math.min(shortestInDay(times), acrossMidnight(walk, times)) < scheduleTiming.minimumMinutes) {
    return Result.fail("cron_too_frequent");
  }
  return Result.void;
}

function cronRefusal(expression: string, timeZone: string): Result.Result<void, Refused> {
  const fields = Str.split(Str.trim(expression), FIELD_GAP);
  if (fields.length !== CRON_FIELDS || Result.isFailure(Cron.parse(expression, timeZone))) {
    return Result.fail("cron_invalid");
  }
  return frequencyOf(expression);
}

function zoneRefusal(timeZone: string): Result.Result<void, Refused> {
  if (!ZONE_NAME.test(timeZone) || Option.isNone(DateTime.zoneMakeNamed(timeZone))) {
    return Result.fail("time_zone_invalid");
  }
  return Result.void;
}

function atMoment(at: string, timeZone: string): Option.Option<DateTime.DateTime> {
  if (HAS_OFFSET.test(at)) {
    return DateTime.make(at);
  }
  return DateTime.makeZoned(at, { adjustForTimeZone: true, timeZone });
}

function atOf(
  { at, timeZone }: Pick<Asked, "timeZone"> & { readonly at: string },
  now: DateTime.Utc,
): Result.Result<IsoTime, Refused> {
  const moment = atMoment(at, timeZone);
  if (Option.isNone(moment)) {
    return Result.fail("at_invalid");
  }
  if (DateTime.toEpochMillis(moment.value) <= DateTime.toEpochMillis(now)) {
    return Result.fail("at_in_past");
  }
  return Result.succeed(isoTimeOf(moment.value));
}

function askedTiming({ at, cron, timeZone }: Asked, now: DateTime.Utc): Result.Result<Timed, Refused> {
  if (Predicate.isNotUndefined(cron) && Predicate.isUndefined(at)) {
    return Result.map(cronRefusal(cron, timeZone), () => ({ at: null, cron: Str.trim(cron), timeZone }));
  }
  if (Predicate.isNotUndefined(at) && Predicate.isUndefined(cron)) {
    return Result.map(atOf({ at, timeZone }, now), (moment) => ({ at: moment, cron: null, timeZone }));
  }
  return Result.fail("cron_or_at");
}

function timingOf(asked: Asked & { readonly now: DateTime.Utc }): Result.Result<Timed, Refused> {
  return Result.flatMap(zoneRefusal(asked.timeZone), () => askedTiming(asked, asked.now));
}

function cronRuns(cron: Cron.Cron, after: number, count: number): readonly IsoTime[] {
  if (count <= NONE) {
    return [];
  }
  const next = DateTime.toEpochMillis(DateTime.fromDateUnsafe(Cron.next(cron, after)));
  return [isoAt(next), ...cronRuns(cron, next, count - NEXT)];
}

function runsAfter({ count, now, timing }: AtMoment & { readonly count: number }): readonly IsoTime[] {
  const after = Math.max(millisOf(now), millisOf(timing.runsFrom));
  if (timing.cron !== null) {
    return cronRuns(Cron.parseUnsafe(timing.cron, timing.timeZone), after, count);
  }
  return Arr.filter(Arr.fromNullishOr(timing.at), (at) => millisOf(at) > after);
}

function latestDue({ now, timing }: AtMoment): Option.Option<IsoTime> {
  if (timing.cron === null) {
    return Option.filter(
      Option.fromNullishOr(timing.at),
      (at) => millisOf(at) <= millisOf(now) && at > timing.runsFrom,
    );
  }
  const cron = Cron.parseUnsafe(timing.cron, timing.timeZone);
  const latest = DateTime.fromDateUnsafe(Cron.prev(cron, millisOf(now) + JUST_AFTER));
  return Option.liftPredicate(isoTimeOf(latest), (due) => millisOf(due) > millisOf(timing.runsFrom));
}

function isLate({ due, now }: { readonly due: IsoTime; readonly now: IsoTime }): boolean {
  return millisOf(now) - millisOf(due) >= scheduleTiming.lateMinutes * MS_IN_MINUTE;
}

export { type Refused, isLate, latestDue, millisOf, runsAfter, timingOf };

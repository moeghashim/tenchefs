/**
 * Search on the backend: the `before:` and `after:` filters as moments. A day is a UTC day written `YYYY-MM-DD`;
 * `before:D` finds messages created before D begins and `after:D` those created after D ends, so neither finds D
 * itself. Repeated, each keeps the narrowest: the earliest `before:` and the latest `after:`.
 */
import { Array as Arr, DateTime, Option, Order, pipe } from "effect";
import type { IsoTime } from "../time/index.ts";
import type { ParsedQuery } from "./index.ts";
import { isoTimeOf } from "../time/server.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MIDNIGHT = "T00:00:00.000Z";
const ONE_DAY = { days: 1 } as const;

type DateFilters = Pick<ParsedQuery, "after" | "before">;

interface DateBounds {
  readonly createdBefore?: IsoTime;
  readonly createdSince?: IsoTime;
}

function startOf(day: string): Option.Option<DateTime.Utc> {
  return pipe(
    Option.liftPredicate(day, (text) => DAY.test(text)),
    Option.flatMap((text) => DateTime.make(`${text}${MIDNIGHT}`)),
    Option.map(DateTime.toUtc),
    Option.filter((start) => DateTime.formatIsoDateUtc(start) === day),
  );
}

interface Narrowing {
  readonly moments: readonly Option.Option<DateTime.Utc>[];
  readonly order: Order.Order<DateTime.Utc>;
}

function narrowest({ moments, order }: Narrowing): Option.Option<IsoTime> {
  return Arr.match(Arr.getSomes(moments), {
    onEmpty: () => Option.none(),
    onNonEmpty: (some: Arr.NonEmptyReadonlyArray<DateTime.Utc>) => Option.some(isoTimeOf(Arr.min(some, order))),
  });
}

function typedDays(filters: DateFilters): readonly { readonly day: string; readonly filter: string }[] {
  return [
    ...Arr.map(filters.before, (day) => ({ day, filter: `before:${day}` })),
    ...Arr.map(filters.after, (day) => ({ day, filter: `after:${day}` })),
  ];
}

/**
 * The first date filter that isn't a real `YYYY-MM-DD` day, as typed (`before:2026-02-30`), which the search route
 * refuses as `invalid_date`.
 * @param filters The parsed query's `before:` and `after:` days.
 * @returns The filter as typed, if any day isn't real.
 */
export function invalidDateFilter(filters: DateFilters): Option.Option<string> {
  return pipe(
    Arr.findFirst(typedDays(filters), ({ day }) => Option.isNone(startOf(day))),
    Option.map(({ filter }) => filter),
  );
}

/**
 * The moments a query's days bound it by, keeping the narrowest of each: created before the earliest `before:` day
 * begins, and at or after the latest `after:` day ends.
 * @param filters The parsed query's `before:` and `after:` days, each a real day.
 * @returns The bounds; one is missing when no day sets it.
 */
export function dateBoundsOf(filters: DateFilters): DateBounds {
  const createdBefore = narrowest({ moments: Arr.map(filters.before, startOf), order: DateTime.Order });
  const createdSince = narrowest({
    moments: Arr.map(filters.after, (day) => Option.map(startOf(day), DateTime.add(ONE_DAY))),
    order: Order.flip(DateTime.Order),
  });
  return {
    ...Option.match(createdBefore, { onNone: () => ({}), onSome: (moment) => ({ createdBefore: moment }) }),
    ...Option.match(createdSince, { onNone: () => ({}), onSome: (moment) => ({ createdSince: moment }) }),
  };
}

export type { DateBounds };

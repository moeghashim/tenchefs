import { Array as Arr, Effect, Schema } from "effect";
import type { Redacted, Scope } from "effect";
import type { FullStorage } from "./memory-store.ts";
import type { PostgresDatabase } from "./adapters/postgres.ts";
import type { QueryPlan } from "./query-plans-sqlite.ts";
import type { SqlValue } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { openPostgresStore } from "./postgres-store.ts";
import { unreadable } from "./errors.ts";

type Ran = readonly [string, readonly SqlValue[]];

type Statement<Result> = (sql: string, ...params: readonly SqlValue[]) => Result;

const PlanRows = Schema.Array(Schema.Struct({ "QUERY PLAN": Schema.String }));

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function spied<Result>(note: (ran: Ran) => void, work: Statement<Result>): Statement<Result> {
  return (sql, ...params) => {
    note([sql, params]);
    return work(sql, ...params);
  };
}

function planOf(db: PostgresDatabase, [sql, params]: Ran): Effect.Effect<QueryPlan, StorageUnavailable> {
  return db.all(`EXPLAIN ${sql}`, ...params).pipe(
    Effect.flatMap((rows) => Effect.mapError(Schema.decodeUnknownEffect(PlanRows)(rows), unreadable)),
    Effect.map((rows) => ({ plan: Arr.map(rows, (row) => row["QUERY PLAN"]), sql })),
  );
}

interface Planning<Failure> {
  readonly url: Redacted.Redacted;
  readonly work: (storage: FullStorage) => Effect.Effect<unknown, Failure>;
}

function postgresQueryPlans<Failure>({
  url,
  work,
}: Planning<Failure>): Effect.Effect<readonly QueryPlan[], Failure | StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* plans() {
    const seen = new Map<string, readonly SqlValue[]>();
    const planners: ((ran: Ran) => Effect.Effect<QueryPlan, StorageUnavailable>)[] = [];
    function note([sql, params]: Ran): void {
      seen.set(sql, params);
    }
    function watch(db: PostgresDatabase): PostgresDatabase {
      planners.push((ran) => planOf(db, ran));
      return { ...db, all: spied(note, db.all), get: spied(note, db.get), run: spied(note, db.run) };
    }
    const storage = yield* openPostgresStore({ url, watch });
    yield* work(storage);
    const statements = Arr.fromIterable(seen);
    const plansPerDatabase = yield* Effect.forEach(
      planners,
      (planner) => Effect.forEach(statements, planner, ONE_AT_A_TIME),
      ONE_AT_A_TIME,
    );
    return Arr.flatten(plansPerDatabase);
  });
}

export { postgresQueryPlans };

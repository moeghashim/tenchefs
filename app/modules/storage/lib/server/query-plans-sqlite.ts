import { Array as Arr, Effect, Schema } from "effect";
import type { FileSystem, Scope } from "effect";
import type { FullStorage } from "./memory-store.ts";
import type { SecretsCipher } from "../../../secrets/server.ts";
import type { SqliteDatabase } from "./adapters/sqlite.ts";
import type { StorageUnavailable } from "./errors.ts";
import { openSqliteStore } from "./sqlite-store.ts";
import { unreadable } from "./errors.ts";

interface QueryPlan {
  readonly sql: string;
  readonly plan: readonly string[];
}

const PlanRows = Schema.Array(Schema.Struct({ detail: Schema.String }));

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function spied<Args extends readonly unknown[], Result>(
  note: (sql: string) => void,
  work: (sql: string, ...args: Args) => Result,
): (sql: string, ...args: Args) => Result {
  return (sql, ...args) => {
    note(sql);
    return work(sql, ...args);
  };
}

function planOf(db: SqliteDatabase, sql: string): Effect.Effect<QueryPlan, StorageUnavailable> {
  return db.all(`EXPLAIN QUERY PLAN ${sql}`).pipe(
    Effect.flatMap((rows) => Effect.mapError(Schema.decodeUnknownEffect(PlanRows)(rows), unreadable)),
    Effect.map((rows) => ({ plan: Arr.map(rows, ({ detail }) => detail), sql })),
  );
}

interface Planning<Failure> {
  readonly path: string;
  readonly cipher: SecretsCipher;
  readonly work: (storage: FullStorage) => Effect.Effect<unknown, Failure>;
}

function sqliteQueryPlans<Failure>({
  cipher,
  path,
  work,
}: Planning<Failure>): Effect.Effect<
  readonly QueryPlan[],
  Failure | StorageUnavailable,
  FileSystem.FileSystem | Scope.Scope
> {
  return Effect.gen(function* plans() {
    const seen = new Set<string>();
    const opened: SqliteDatabase[] = [];
    function note(sql: string): void {
      seen.add(sql);
    }
    function watch(db: SqliteDatabase): SqliteDatabase {
      opened.push(db);
      return { ...db, all: spied(note, db.all), get: spied(note, db.get), run: spied(note, db.run) };
    }
    const storage = yield* openSqliteStore({ cipher, path, watch });
    yield* work(storage);
    const statements = Arr.fromIterable(seen);
    const plansPerDatabase = yield* Effect.forEach(
      opened,
      (db) => Effect.forEach(statements, (sql) => planOf(db, sql), ONE_AT_A_TIME),
      ONE_AT_A_TIME,
    );
    return Arr.flatten(plansPerDatabase);
  });
}

export { type QueryPlan, sqliteQueryPlans };

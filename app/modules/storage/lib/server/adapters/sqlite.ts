import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { Effect, Semaphore } from "effect";
import type { Scope } from "effect";
import { StorageUnavailable } from "../errors.ts";

type SqlValue = SQLInputValue;

export type SqliteDatabase = {
  readonly dialect: "sqlite";
  readonly get: (sql: string, ...params: readonly SqlValue[]) => Effect.Effect<unknown, StorageUnavailable>;
  readonly all: (sql: string, ...params: readonly SqlValue[]) => Effect.Effect<readonly unknown[], StorageUnavailable>;
  readonly run: (sql: string, ...params: readonly SqlValue[]) => Effect.Effect<void, StorageUnavailable>;
  readonly exec: (sql: string) => Effect.Effect<void, StorageUnavailable>;
  readonly transaction: <A, E>(work: Effect.Effect<A, E>) => Effect.Effect<A, E | StorageUnavailable>;
};

const unavailable = (cause: unknown): StorageUnavailable =>
  new StorageUnavailable({ message: cause instanceof Error ? cause.message : String(cause) });

const wrap = (db: DatabaseSync): SqliteDatabase => {
  const attempt = <A>(work: () => A): Effect.Effect<A, StorageUnavailable> =>
    Effect.try({ catch: unavailable, try: work });
  const exec = (sql: string) => attempt(() => db.exec(sql));
  const oneAtATime = Semaphore.makeUnsafe(1);
  return {
    all: (sql, ...params) => attempt((): readonly unknown[] => db.prepare(sql).all(...params)),
    dialect: "sqlite",
    exec,
    get: (sql, ...params) => attempt((): unknown => db.prepare(sql).get(...params)),
    run: (sql, ...params) => attempt(() => void db.prepare(sql).run(...params)),
    transaction: (work) =>
      oneAtATime.withPermits(1)(
        Effect.acquireUseRelease(
          exec("BEGIN IMMEDIATE"),
          () => work,
          (_, exit) => exec(exit._tag === "Success" ? "COMMIT" : "ROLLBACK").pipe(Effect.orDie),
        ),
      ),
  };
};

export const openSqlite = (path: string): Effect.Effect<SqliteDatabase, StorageUnavailable, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.gen(function* openDatabase() {
      const { DatabaseSync } = yield* Effect.tryPromise({ catch: unavailable, try: () => import("node:sqlite") });
      return yield* Effect.try({
        catch: unavailable,
        try: () => {
          const db = new DatabaseSync(path);
          db.exec(
            "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
          );
          return db;
        },
      });
    }),
    (db) => Effect.sync(() => (db.isOpen ? db.close() : undefined)),
  ).pipe(Effect.map(wrap));

import {
  Array as Arr,
  Clock,
  Effect,
  Function as Fn,
  Option,
  Predicate,
  Ref,
  Schedule,
  Schema,
  Semaphore,
  String as Str,
} from "effect";
import type { Redacted, Scope } from "effect";
import { SqlClient, SqlError } from "effect/sql";
import type { SqlDatabase, SqlValue } from "./sql-database.ts";
import { PgClient } from "@effect/sql-pg";
import { Reactivity } from "effect/reactivity";
import { StorageUnavailable } from "../errors.ts";
import { sqliteShapedTypes } from "./postgres-types.ts";

interface Migrating {
  readonly migrating: <Value, Failure>(
    work: Effect.Effect<Value, Failure>,
  ) => Effect.Effect<Value, Failure | StorageUnavailable>;
}

type PostgresDatabase = SqlDatabase & Migrating;

const SERIALIZABLE = "BEGIN ISOLATION LEVEL SERIALIZABLE";
const READ_COMMITTED = "BEGIN ISOLATION LEVEL READ COMMITTED";
const MIGRATION_LOCK = 3_310_330n;
const RETRIES = 8;
const FIRST_RETRY = "5 millis";
const POOL_SIZE = 8;
const ONE_PERMIT = 1;
const FIRST_PLACEHOLDER = 1;
const CONNECT_TIMEOUT = "5 seconds";
const IDLE_TIMEOUT = "1 minute";
const CONNECTION_TTL = "30 minutes";
const STATEMENT_TIMEOUT_MS = "5000";
const RETRYABLE_REASONS = ["SerializationError", "DeadlockError"] as const;

interface SqlFailure {
  readonly _tag: "SqlError";
  readonly message: string;
  readonly reason: { readonly _tag: string; readonly cause: unknown };
}

const retryable = new WeakSet<StorageUnavailable>();

const isStorageUnavailable = Schema.is(StorageUnavailable);

const hasMessage = Schema.is(Schema.Struct({ message: Schema.String }));

function messageOf(error: SqlFailure): string {
  const { cause } = error.reason;
  return Option.liftPredicate(cause, hasMessage).pipe(
    Option.map(({ message }) => message),
    Option.getOrElse(Fn.constant(error.message)),
  );
}

function unavailable(error: SqlFailure): StorageUnavailable {
  const failure = StorageUnavailable.make({ message: messageOf(error) });
  if (Arr.some(RETRYABLE_REASONS, (reason) => Predicate.isTagged(error.reason, reason))) {
    retryable.add(failure);
  }
  return failure;
}

function isSqlFailure(error: unknown): error is SqlFailure {
  return SqlError.isSqlError(error);
}

function asStorageFailure<Failure>(error: Failure | SqlFailure): Failure | StorageUnavailable {
  if (isSqlFailure(error)) {
    return unavailable(error);
  }
  return error;
}

function isRetryable(error: unknown): boolean {
  return isStorageUnavailable(error) && retryable.has(error);
}

const POSITIONED_PLACEHOLDER = /\?(?=\d)/u;
const POSITIONED_PLACEHOLDERS = /\?(?=\d)/gu;

function numbered(sql: string): string {
  if (POSITIONED_PLACEHOLDER.test(sql)) {
    return Str.replaceAll(POSITIONED_PLACEHOLDERS, "$$")(sql);
  }
  const parts = Str.split("?")(sql);
  return Arr.reduce(
    Arr.tailNonEmpty(parts),
    Arr.headNonEmpty(parts),
    (text, part, index) => `${text}$${index + FIRST_PLACEHOLDER}${part}`,
  );
}

function asText(value: SqlValue): SqlValue {
  if (Predicate.isNumber(value) || Predicate.isBigInt(value)) {
    return String(value);
  }
  return value;
}

const closedStore = StorageUnavailable.make({ message: "The store is closed." });

function openPool(url: Redacted.Redacted): Effect.Effect<PgClient.PgClient, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* openClient() {
    const reactivity = yield* Reactivity.make;
    return yield* PgClient.make({
      acquireTimeout: CONNECT_TIMEOUT,
      connectTimeout: CONNECT_TIMEOUT,
      connectionTTL: CONNECTION_TTL,
      idleTimeout: IDLE_TIMEOUT,
      maxConnections: POOL_SIZE,
      startupParameters: { statement_timeout: STATEMENT_TIMEOUT_MS },
      types: sqliteShapedTypes(),
      url,
    }).pipe(
      Effect.provideService(Reactivity.Reactivity, reactivity),
      Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()),
      Effect.mapError(unavailable),
    );
  });
}

function whileOpen(isStoreOpen: Effect.Effect<boolean>): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(isStoreOpen, (isOpen) => {
    if (isOpen) {
      return Effect.void;
    }
    return Effect.fail(closedStore);
  });
}

function retryConflicts<Value, Failure>(attempt: Effect.Effect<Value, Failure>): Effect.Effect<Value, Failure> {
  return Effect.retry(attempt, {
    schedule: Schedule.jittered(Schedule.exponential(FIRST_RETRY)),
    times: RETRIES,
    while: isRetryable,
  });
}

function openPostgres(url: Redacted.Redacted): Effect.Effect<PostgresDatabase, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* openDatabase() {
    const sql = yield* openPool(url);
    const open = yield* Ref.make(true);
    yield* Effect.addFinalizer(() => Ref.set(open, false));
    const ensureOpen = whileOpen(Ref.get(open));
    function query(text: string, params: readonly SqlValue[]): Effect.Effect<readonly unknown[], StorageUnavailable> {
      const statement = sql.unsafe(numbered(text), Arr.map(params, asText));
      return Effect.andThen(ensureOpen, Effect.mapError(statement, unavailable));
    }
    const lockMigrations = Effect.andThen(
      ensureOpen,
      Effect.mapError(sql.unsafe("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]), unavailable),
    );
    const oneAtATime = Semaphore.makeUnsafe(ONE_PERMIT);
    function inTransaction<Value, Failure>(
      begin: string,
      work: Effect.Effect<Value, Failure>,
    ): Effect.Effect<Value, Failure | StorageUnavailable> {
      const transaction = sql
        .withTransaction(work)
        .pipe(Effect.provideService(SqlClient.BeginTransaction, begin), Effect.mapError(asStorageFailure<Failure>));
      return Effect.andThen(ensureOpen, oneAtATime.withPermits(ONE_PERMIT)(transaction));
    }
    const database: PostgresDatabase = {
      all: (text, ...params) => query(text, params),
      dialect: "postgres",
      exec: (text) => Effect.asVoid(query(text, [])),
      get: (text, ...params) => Effect.map(query(text, params), (rows) => Option.getOrUndefined(Arr.head(rows))),
      migrating: (work) => inTransaction(READ_COMMITTED, Effect.andThen(lockMigrations, work)),
      run: (text, ...params) => Effect.asVoid(query(text, params)),
      transaction: (work) => retryConflicts(inTransaction(SERIALIZABLE, work)),
    };
    return database;
  });
}

export { openPostgres, type PostgresDatabase };

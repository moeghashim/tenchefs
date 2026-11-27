import { Array as Arr, Effect, Function as Fn, Layer, Option, Redacted, Schema, String as Str } from "effect";
import { StorageUnavailable, postgresStorage } from "../../../storage/server.ts";
import { PgClient } from "@effect/sql-pg";
import { Reactivity } from "effect/reactivity";
import type { Scope } from "effect";
import { inject } from "vitest";
import { testSecretsCipher } from "./secrets-key.ts";

type Run = (statement: string) => Effect.Effect<readonly unknown[], StorageUnavailable>;

interface DatabaseStatements {
  readonly url: Redacted.Redacted;
  readonly statements: readonly string[];
}

const TEMPLATE = "cookout_template";
const BUILDING_TEMPLATE = "cookout_template_building";
const EMPTY_TEMPLATE = "template0";
const FORGET_WHEN_NUDGES_AND_ACTIVITY_BEGAN = ["DELETE FROM nudges_since", "DELETE FROM activity_since"];
const DATABASE_NUMBERS = "cookout_test_databases";
const TEMPLATE_LOCK = 3_310_331;

const NumberRow = Schema.Struct({ number: Schema.String });

const containerUrl: Effect.Effect<string, StorageUnavailable> = Effect.suspend(() => {
  const { reason, url } = inject("postgres");
  const unavailable = StorageUnavailable.make({ message: reason });
  return Option.liftPredicate(url, Str.isNonEmpty).pipe(Effect.fromOption, Effect.mapError(Fn.constant(unavailable)));
});

function databaseUrl(server: string, database: string): Redacted.Redacted {
  const url = new URL(server);
  url.pathname = `/${database}`;
  return Redacted.make(url.toString());
}

function connect(url: Redacted.Redacted): Effect.Effect<Run, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* connectOnce() {
    const reactivity = yield* Reactivity.make;
    const sql = yield* PgClient.makeClient({ url }).pipe(
      Effect.provideService(Reactivity.Reactivity, reactivity),
      Effect.orDie,
    );
    return (statement: string) => Effect.orDie(sql.unsafe(statement));
  });
}

function onAdmin<Value>(
  work: (run: Run) => Effect.Effect<Value, StorageUnavailable>,
): Effect.Effect<Value, StorageUnavailable> {
  return Effect.scoped(
    Effect.gen(function* withAdmin() {
      const server = yield* containerUrl;
      const run = yield* connect(databaseUrl(server, "postgres"));
      return yield* work(run);
    }),
  );
}

function onPostgresDatabase({ statements, url }: DatabaseStatements): Effect.Effect<void, StorageUnavailable> {
  return Effect.scoped(
    Effect.flatMap(connect(url), (run) => Effect.forEach(statements, run, { concurrency: 1, discard: true })),
  );
}

function postgresRows({
  statement,
  url,
}: {
  readonly statement: string;
  readonly url: Redacted.Redacted;
}): Effect.Effect<readonly unknown[], StorageUnavailable> {
  return Effect.scoped(Effect.flatMap(connect(url), (run) => run(statement)));
}

function buildTemplate(run: Run): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* migrateTemplate() {
    yield* run(`DROP DATABASE IF EXISTS ${BUILDING_TEMPLATE} WITH (FORCE)`);
    yield* run(`CREATE DATABASE ${BUILDING_TEMPLATE}`);
    const server = yield* containerUrl;
    const url = databaseUrl(server, BUILDING_TEMPLATE);
    yield* Effect.scoped(Layer.build(postgresStorage({ cipher: testSecretsCipher, url })));
    yield* onPostgresDatabase({ statements: FORGET_WHEN_NUDGES_AND_ACTIVITY_BEGAN, url });
    yield* run(`ALTER DATABASE ${BUILDING_TEMPLATE} RENAME TO ${TEMPLATE}`);
  });
}

const isNumberRow = Schema.is(NumberRow);

function nextDatabaseName(run: Run): Effect.Effect<string> {
  return run(`SELECT nextval('${DATABASE_NUMBERS}')::text AS number`).pipe(
    Effect.map(Arr.filter(isNumberRow)),
    Effect.map(Arr.head),
    Effect.flatMap(Effect.fromOption),
    Effect.orDie,
    Effect.map(({ number }) => `cookout_test_${number}`),
  );
}

function ensureTemplate(run: Run): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(run(`SELECT 1 FROM pg_database WHERE datname = '${TEMPLATE}'`), (found) =>
    Effect.when(buildTemplate(run), Effect.succeed(Arr.isReadonlyArrayEmpty(found))),
  ).pipe(Effect.asVoid);
}

function prepare(run: Run): Effect.Effect<string, StorageUnavailable> {
  return Effect.acquireUseRelease(
    run(`SELECT pg_advisory_lock(${TEMPLATE_LOCK})`),
    () =>
      Effect.andThen(
        Effect.andThen(run(`CREATE SEQUENCE IF NOT EXISTS ${DATABASE_NUMBERS}`), ensureTemplate(run)),
        nextDatabaseName(run),
      ),
    () => Effect.ignore(run(`SELECT pg_advisory_unlock(${TEMPLATE_LOCK})`)),
  );
}

function dropDatabase(name: string): Effect.Effect<void> {
  return Effect.ignore(onAdmin((run) => run(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)));
}

function createFrom(template: string): (run: Run) => Effect.Effect<string, StorageUnavailable> {
  return (run) => Effect.tap(prepare(run), (database) => run(`CREATE DATABASE ${database} TEMPLATE ${template}`));
}

function scopedDatabase(template: string): Effect.Effect<Redacted.Redacted, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* makeDatabase() {
    const server = yield* containerUrl;
    const name = yield* Effect.acquireRelease(onAdmin(createFrom(template)), dropDatabase);
    return databaseUrl(server, name);
  });
}

const freshPostgresDatabase = scopedDatabase(TEMPLATE);

const emptyPostgresDatabase = scopedDatabase(EMPTY_TEMPLATE);

export { emptyPostgresDatabase, freshPostgresDatabase, onPostgresDatabase, postgresRows };

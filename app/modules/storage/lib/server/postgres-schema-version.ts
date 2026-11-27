import { Array as Arr, Effect, Option, Schema } from "effect";
import type { PostgresDatabase } from "./adapters/postgres.ts";
import { StorageUnavailable } from "./errors.ts";

const NO_VERSION = 0;

const VersionRow = Schema.Struct({ version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(NO_VERSION)) });

const SCHEMA_VERSION_TABLE = `CREATE TABLE IF NOT EXISTS schema_version (
  only_row integer PRIMARY KEY CHECK (only_row = 1),
  version integer NOT NULL
)`;

const unreadableVersion = StorageUnavailable.make({ message: "The database has no readable schema version." });

function decodeVersion(row: unknown): Effect.Effect<number, StorageUnavailable> {
  return Schema.decodeUnknownEffect(VersionRow)(row).pipe(
    Effect.mapBoth({ onFailure: () => unreadableVersion, onSuccess: ({ version }) => version }),
  );
}

function currentVersion(db: PostgresDatabase): Effect.Effect<number, StorageUnavailable> {
  return Effect.gen(function* readVersion() {
    yield* db.exec(SCHEMA_VERSION_TABLE);
    yield* db.exec("INSERT INTO schema_version (only_row, version) VALUES (1, 0) ON CONFLICT DO NOTHING");
    return yield* Effect.flatMap(db.get("SELECT version FROM schema_version"), decodeVersion);
  });
}

function tooNew({ current, latest }: { readonly current: number; readonly latest: number }): StorageUnavailable {
  return StorageUnavailable.make({
    message: `The database is at schema version ${current}, newer than this cookout (${latest}). Upgrade cookout.`,
  });
}

const NEXT_VERSION = 1;

type Migrations = readonly (readonly string[])[];

interface Migrating {
  readonly db: PostgresDatabase;
  readonly migrations: Migrations;
}

function applyNext({ db, migrations }: Migrating): Effect.Effect<boolean, StorageUnavailable> {
  return db.migrating(
    Effect.gen(function* applyNextMigration() {
      const version = yield* currentVersion(db);
      if (version > migrations.length) {
        return yield* tooNew({ current: version, latest: migrations.length });
      }
      return yield* Option.match(Arr.get(migrations, version), {
        onNone: () => Effect.succeed(false),
        onSome: (statements) =>
          Effect.as(
            Effect.andThen(
              Effect.forEach(statements, (statement) => db.exec(statement), { concurrency: 1, discard: true }),
              db.run("UPDATE schema_version SET version = ?", version + NEXT_VERSION),
            ),
            true,
          ),
      });
    }),
  );
}

function migrateInOrder(migrating: Migrating): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(applyNext(migrating), (applied) =>
    Effect.asVoid(Effect.when(migrateInOrder(migrating), Effect.succeed(applied))),
  );
}

export { migrateInOrder };

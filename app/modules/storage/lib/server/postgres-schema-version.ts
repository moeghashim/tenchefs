import { Effect, Schema } from "effect";
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

export { currentVersion };

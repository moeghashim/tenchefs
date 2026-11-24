import { Effect, identity } from "effect";
import type { Redacted, Scope } from "effect";
import type { FullStorage } from "./memory-store.ts";
import type { PostgresDatabase } from "./adapters/postgres.ts";
import type { StorageUnavailable } from "./errors.ts";
import { migratePostgres } from "./postgres-migrations.ts";
import { openPostgres } from "./adapters/postgres.ts";
import { sqlStorage } from "./sql-storage.ts";
import { sqlStore } from "./sql-store.ts";

interface PostgresOpening {
  readonly url: Redacted.Redacted;
  readonly watch?: (db: PostgresDatabase) => PostgresDatabase;
}

function openPostgresStore({
  url,
  watch = identity,
}: PostgresOpening): Effect.Effect<FullStorage, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* openStore() {
    const opened = yield* openPostgres(url);
    yield* migratePostgres(opened);
    const db = watch(opened);
    return yield* sqlStore({ db, storage: sqlStorage(db) });
  });
}

export { openPostgresStore };

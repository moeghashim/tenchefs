import { Effect, identity } from "effect";
import type { Redacted, Scope } from "effect";
import type { FullStorage } from "./memory-store.ts";
import type { PostgresDatabase } from "./adapters/postgres.ts";
import type { SecretsCipher } from "../../../secrets/server.ts";
import type { StorageUnavailable } from "./errors.ts";
import { migratePostgres } from "./postgres-migrations.ts";
import { openPostgres } from "./adapters/postgres.ts";
import { sqlStorage } from "./sql-storage.ts";
import { sqlStore } from "./sql-store.ts";

interface PostgresOpening {
  readonly url: Redacted.Redacted;
  readonly cipher: SecretsCipher;
  readonly watch?: (db: PostgresDatabase) => PostgresDatabase;
}

function openPostgresStore({
  cipher,
  url,
  watch = identity,
}: PostgresOpening): Effect.Effect<FullStorage, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* openStore() {
    const opened = yield* openPostgres(url);
    yield* migratePostgres(opened);
    const db = watch(opened);
    return yield* sqlStore({ db, storage: sqlStorage({ cipher, db }) });
  });
}

export { openPostgresStore };

import { Effect } from "effect";
import type { Fails } from "./errors.ts";
import type { FullStorage } from "./memory-store.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageService } from "./service.ts";
import { sqlDeactivationOffers } from "./deactivation-offers-sqlite.ts";
import { sqlNudges } from "./nudges-sqlite.ts";
import { withActivity } from "./activity.ts";

interface OpenedSql {
  readonly db: SqlDatabase;
  readonly storage: StorageService;
}

function sqlStore({ db, storage }: OpenedSql): Fails<FullStorage> {
  return Effect.gen(function* openStore() {
    const nudges = yield* sqlNudges({ db, sources: storage });
    const offers = yield* sqlDeactivationOffers({ db, sources: storage });
    return withActivity({ record: offers.recordActivity, store: { ...storage, ...nudges, ...offers } });
  });
}

export { sqlStore };

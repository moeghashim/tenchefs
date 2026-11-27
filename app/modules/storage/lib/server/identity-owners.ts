import { Effect, Option, Schema } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { nameFitsOwner } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type CreateRefusal = "name_taken" | "name_not_owned" | "owner_not_human";

interface Existing {
  readonly taken: boolean;
  readonly ownerIsHuman: boolean;
}

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const NO_ROWS = 0;

const COUNT_EXISTING = `SELECT
  (SELECT count(*) FROM identities WHERE name = ?) AS taken,
  (SELECT count(*) FROM identities WHERE name = ? AND kind = 'human') AS owner_humans`;

const ExistingRow = Schema.Struct({ owner_humans: Schema.Int, taken: Schema.Int });

function ownerOf(identity: Identity): IdentityName {
  if (identity.kind === "agent") {
    return identity.owner;
  }
  return identity.name;
}

function createRefusal(identity: Identity, { ownerIsHuman, taken }: Existing): Option.Option<CreateRefusal> {
  if (taken) {
    return Option.some("name_taken");
  }
  if (!nameFitsOwner(identity)) {
    return Option.some("name_not_owned");
  }
  if (identity.kind === "agent" && !ownerIsHuman) {
    return Option.some("owner_not_human");
  }
  return Option.none();
}

function memoryCreateRefusal(
  identities: ReadonlyMap<IdentityName, Identity>,
): (identity: Identity) => Option.Option<CreateRefusal> {
  return (identity) => {
    const owner = Option.fromUndefinedOr(identities.get(ownerOf(identity)));
    return createRefusal(identity, {
      ownerIsHuman: Option.exists(owner, (found) => found.kind === "human"),
      taken: identities.has(identity.name),
    });
  };
}

function sqlCreateRefusal(db: SqlDatabase): (identity: Identity) => Fails<Option.Option<CreateRefusal>> {
  return (identity) =>
    db.get(COUNT_EXISTING, identity.name, ownerOf(identity)).pipe(
      Effect.flatMap((row) => Effect.mapError(Schema.decodeUnknownEffect(ExistingRow)(row), unreadable)),
      Effect.map((row) =>
        createRefusal(identity, { ownerIsHuman: row.owner_humans > NO_ROWS, taken: row.taken > NO_ROWS }),
      ),
    );
}

export { memoryDeactivations, sqlDeactivations } from "./identity-deactivations.ts";

export {
  type AvatarRemovalsSection,
  type AvatarsToRemove,
  type DeleteIdentityResult,
  type IdentityDeletesSection,
  memoryAvatarRemovals,
  memoryRemoveIdentity,
  sqlAvatarRemovals,
  sqlIdentityDeletes,
} from "./identity-deletes.ts";

export { type CreateRefusal, memoryCreateRefusal, sqlCreateRefusal };

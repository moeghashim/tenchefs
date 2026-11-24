import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import { IDENTITY_COLUMNS, IdentityRow, toIdentity } from "./identity-row.ts";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { nameFitsOwner } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type SetAdminResult =
  | { readonly status: "set"; readonly identity: Identity }
  | { readonly status: "agent"; readonly identity: Identity }
  | { readonly status: "not_found" }
  | { readonly status: "last_admin" };

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type SetAdmin = (name: IdentityName, admin: boolean) => Fails<SetAdminResult>;

const LAST_ADMIN_COUNT = 1;

const SELECT_IDENTITY = `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE name = ?`;

const COUNT_ADMINS = "SELECT count(*) AS count FROM identities WHERE admin = TRUE AND deactivated = FALSE";

const AdminCountRow = Schema.Struct({ count: Schema.Int });

function clearsLastAdmin(identity: Identity, admin: boolean, admins: number): boolean {
  return !admin && identity.admin && admins === LAST_ADMIN_COUNT;
}

function adminChange(identity: Identity, admin: boolean, admins: number): SetAdminResult {
  if (admin && identity.kind === "agent") {
    return { identity, status: "agent" };
  }
  if (clearsLastAdmin(identity, admin, admins)) {
    return { status: "last_admin" };
  }
  return { identity: { ...identity, admin }, status: "set" };
}

function memorySetAdmin(
  identities: Map<IdentityName, Identity>,
): (name: IdentityName, admin: boolean) => SetAdminResult {
  return (name, admin) => {
    const identity = identities.get(name);
    if (Predicate.isUndefined(identity)) {
      return { status: "not_found" };
    }
    const admins = Arr.filter([...identities.values()], (found) => found.admin && found.deactivated !== true).length;
    const result = adminChange({ ...identity }, admin, admins);
    if (result.status === "set") {
      identities.set(name, { ...result.identity });
    }
    return result;
  };
}

function countAdmins(db: SqlDatabase): Fails<number> {
  return db.get(COUNT_ADMINS).pipe(
    Effect.flatMap((row) => Effect.mapError(Schema.decodeUnknownEffect(AdminCountRow)(row), unreadable)),
    Effect.map((row) => row.count),
  );
}

function setAdminRow(db: SqlDatabase, row: unknown, admin: boolean): Fails<SetAdminResult> {
  return Effect.gen(function* setAdminOnRow() {
    const decoded = yield* Effect.mapError(Schema.decodeUnknownEffect(IdentityRow)(row), unreadable);
    const admins = yield* countAdmins(db);
    const result = adminChange(toIdentity(decoded), admin, admins);
    if (result.status === "set") {
      yield* db.run("UPDATE identities SET admin = ? WHERE name = ?", Number(admin), decoded.name);
    }
    return result;
  });
}

function sqlSetAdmin(db: SqlDatabase): SetAdmin {
  return (name, admin) =>
    db.transaction(
      Effect.flatMap(db.get(SELECT_IDENTITY, name), (row) => {
        if (Predicate.isUndefined(row)) {
          return Effect.succeed<SetAdminResult>({ status: "not_found" });
        }
        return setAdminRow(db, row, admin);
      }),
    );
}

type TransferAgentResult =
  | { readonly status: "transferred"; readonly identity: Identity }
  | { readonly status: "not_found" }
  | { readonly status: "not_agent" }
  | { readonly status: "owner_not_human" }
  | { readonly status: "name_not_owned" };

interface TransfersSection {
  readonly transferAgent: (name: IdentityName, owner: IdentityName) => Fails<TransferAgentResult>;
}

interface MemoryTransferMap {
  readonly identities: Map<IdentityName, Identity>;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

interface Parties {
  readonly agent: Option.Option<Identity>;
  readonly owner: Option.Option<Identity>;
}

function movedTo(agent: Identity, owner: Option.Option<Identity>): TransferAgentResult {
  if (agent.kind !== "agent") {
    return { status: "not_agent" };
  }
  if (Option.isNone(owner) || owner.value.kind !== "human") {
    return { status: "owner_not_human" };
  }
  const moved: Identity = { ...agent, owner: owner.value.name };
  if (!nameFitsOwner(moved)) {
    return { status: "name_not_owned" };
  }
  return { identity: moved, status: "transferred" };
}

function transferred({ agent, owner }: Parties): TransferAgentResult {
  return Option.match(agent, {
    onNone: () => ({ status: "not_found" }),
    onSome: (agentFound) => movedTo(agentFound, owner),
  });
}

function memoryTransfers({ identities, open }: MemoryTransferMap): TransfersSection {
  return {
    transferAgent: (name, owner) =>
      open((): TransferAgentResult => {
        const result = transferred({
          agent: Option.fromUndefinedOr(identities.get(name)),
          owner: Option.fromUndefinedOr(identities.get(owner)),
        });
        if (result.status === "transferred") {
          identities.set(name, { ...result.identity });
        }
        return result;
      }),
  };
}

function identityNamed(db: SqlDatabase, name: IdentityName): Fails<Option.Option<Identity>> {
  return db.get(SELECT_IDENTITY, name).pipe(
    Effect.flatMap((row) => {
      if (Predicate.isUndefined(row)) {
        return Effect.succeedNone;
      }
      return Schema.decodeUnknownEffect(IdentityRow)(row).pipe(
        Effect.mapBoth({ onFailure: unreadable, onSuccess: (decoded) => Option.some(toIdentity(decoded)) }),
      );
    }),
  );
}

function sqlTransfers(db: SqlDatabase): TransfersSection {
  return {
    transferAgent: (name, owner) =>
      db.transaction(
        Effect.gen(function* transferAgentRow() {
          const parties = yield* Effect.all(
            { agent: identityNamed(db, name), owner: identityNamed(db, owner) },
            { concurrency: 1 },
          );
          const result = transferred(parties);
          if (result.status === "transferred") {
            yield* db.run("UPDATE identities SET owner = ? WHERE name = ?", owner, name);
          }
          return result;
        }),
      ),
  };
}

export { memorySetAdmin, memoryTransfers, type SetAdminResult, sqlSetAdmin, sqlTransfers, type TransferAgentResult };

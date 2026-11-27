import { Array as Arr, Effect, Option, Predicate, Schema, String as Str } from "effect";
import { IDENTITY_COLUMNS, IdentityRow, toIdentity } from "./identity-row.ts";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { AvatarId } from "../../../avatars/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isAvatarId } from "../../../avatars/index.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type DeleteIdentityResult =
  | { readonly status: "deleted"; readonly identity: Identity }
  | { readonly status: "not_found" }
  | { readonly status: "last_admin" }
  | { readonly status: "has_messages" }
  | { readonly status: "owns_agents"; readonly agents: readonly IdentityName[] };

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface IdentityDeletesSection {
  readonly deleteIdentity: (name: IdentityName) => Fails<DeleteIdentityResult>;
  readonly countMessagesBy: (name: IdentityName) => Fails<number>;
}

interface AvatarRemovalsSection {
  readonly avatarsToRemove: (limit: number) => Fails<readonly AvatarId[]>;
  readonly avatarsRemoved: (ids: readonly AvatarId[]) => Fails<void>;
}

interface DeleteCheck {
  readonly identity: Identity;
  readonly activeAdmins: number;
  readonly agents: readonly IdentityName[];
  readonly messages: number;
}

interface MemoryIdentityDeletesOptions {
  readonly identities: Map<IdentityName, Identity>;
  readonly activeTokens: Map<TokenHash, IdentityName>;
  readonly avatarsToRemove: AvatarsToRemove;
}

const LAST_ADMIN_COUNT = 1;

const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

const NO_MESSAGES = 0;

const SELECT_IDENTITY = `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE name = ?`;

const SELECT_OWNED = "SELECT name FROM identities WHERE kind = 'agent' AND owner = ? ORDER BY name";

const COUNT_ACTIVE_ADMINS = "SELECT count(*) AS count FROM identities WHERE admin = TRUE AND deactivated = FALSE";

const COUNT_MESSAGES = "SELECT count(*) AS count FROM messages WHERE author_name = ? OR author_owner = ?";

const KEEP_AVATAR_TO_REMOVE =
  "INSERT INTO avatars_to_remove (id) SELECT avatar FROM identities WHERE name = ? AND avatar IS NOT NULL";

const SELECT_AVATARS_TO_REMOVE = "SELECT id FROM avatars_to_remove ORDER BY id LIMIT ?";

const DROP_AVATAR_TO_REMOVE = "DELETE FROM avatars_to_remove WHERE id = ?";

const DROP_ROWS = [
  "DELETE FROM deliveries WHERE command IN (SELECT name FROM commands WHERE handler_name = ?)",
  "DELETE FROM commands WHERE handler_name = ?",
  "DELETE FROM command_tokens WHERE handler_name = ?",
  "DELETE FROM scheduled_messages WHERE creator = ?",
  "DELETE FROM tokens WHERE identity_name = ?",
  "DELETE FROM agent_session_tokens WHERE identity_name = ?",
  "DELETE FROM login_credentials WHERE identity_name = ?",
  "DELETE FROM login_requests WHERE approved_by = ?",
  "DELETE FROM message_mentions WHERE identity_name = ?",
  "DELETE FROM follows WHERE identity_name = ?",
  "DELETE FROM subscriptions WHERE identity_name = ?",
  "DELETE FROM channel_read_positions WHERE identity_name = ?",
  "DELETE FROM thread_read_positions WHERE identity_name = ?",
  "DELETE FROM read_receipts WHERE identity_name = ?",
  "DELETE FROM reactions WHERE identity_name = ?",
  "UPDATE identities SET brought_in_by = NULL WHERE brought_in_by = ?",
  "DELETE FROM identities WHERE name = ?",
] as const;

const OwnedRow = Schema.Struct({ name: Schema.String.pipe(Schema.refine(isIdentityName)) });

const CountRow = Schema.Struct({ count: Schema.Int });

const AvatarToRemoveRow = Schema.Struct({ id: Schema.String.pipe(Schema.refine(isAvatarId)) });

function isLastActiveAdmin({ activeAdmins, identity }: DeleteCheck): boolean {
  return identity.admin && identity.deactivated !== true && activeAdmins <= LAST_ADMIN_COUNT;
}

function deleteRefusal(check: DeleteCheck): Option.Option<DeleteIdentityResult> {
  const { agents, messages } = check;
  if (isLastActiveAdmin(check)) {
    return Option.some({ status: "last_admin" });
  }
  if (Arr.isReadonlyArrayNonEmpty(agents)) {
    return Option.some({ agents, status: "owns_agents" });
  }
  if (messages > NO_MESSAGES) {
    return Option.some({ status: "has_messages" });
  }
  return Option.none();
}

function dropTokensOf(activeTokens: Map<TokenHash, IdentityName>, name: IdentityName): void {
  for (const [hash, holder] of activeTokens) {
    if (holder === name) {
      activeTokens.delete(hash);
    }
  }
}

function forgetBringer(identities: Map<IdentityName, Identity>, name: IdentityName): void {
  for (const found of identities.values()) {
    if (found.kind === "agent" && found.broughtInBy === name) {
      const { broughtInBy: _forgotten, ...rest } = found;
      identities.set(found.name, rest);
    }
  }
}

function memoryRemoveIdentity({
  activeTokens,
  avatarsToRemove,
  identities,
}: MemoryIdentityDeletesOptions): (name: IdentityName, messages: number) => DeleteIdentityResult {
  return (name, messages) => {
    const identity = identities.get(name);
    if (Predicate.isUndefined(identity)) {
      return { status: "not_found" };
    }
    const all = [...identities.values()];
    const activeAdmins = Arr.filter(all, (found) => found.admin && found.deactivated !== true).length;
    const owned = Arr.filter(all, (found) => found.kind === "agent" && found.owner === name);
    const agents = Arr.sort(
      Arr.map(owned, (found) => found.name),
      Str.Order,
    );
    return Option.getOrElse(deleteRefusal({ activeAdmins, agents, identity, messages }), () => {
      dropTokensOf(activeTokens, name);
      if (Predicate.isNotUndefined(identity.avatar)) {
        avatarsToRemove.add(identity.avatar.id);
      }
      identities.delete(name);
      forgetBringer(identities, name);
      return { identity: { ...identity }, status: "deleted" } as const;
    });
  };
}

type AvatarsToRemove = Set<AvatarId>;

interface MemoryAvatarRemovalsOptions {
  readonly avatarsToRemove: AvatarsToRemove;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

function memoryAvatarRemovals({ avatarsToRemove, open }: MemoryAvatarRemovalsOptions): AvatarRemovalsSection {
  return {
    avatarsRemoved: (ids) =>
      open(() => {
        for (const id of ids) {
          avatarsToRemove.delete(id);
        }
      }),
    avatarsToRemove: (limit) => open(() => Arr.take(Arr.sort([...avatarsToRemove], Str.Order), limit)),
  };
}

function decodeWith<Decoder extends Schema.Decoder<unknown>>(
  schema: Decoder,
): (row: unknown) => Fails<Decoder["Type"]> {
  return (row) => Effect.mapError(Schema.decodeUnknownEffect(schema)(row), unreadable);
}

function countOf(db: SqlDatabase, sql: string, ...params: readonly string[]): Fails<number> {
  return db.get(sql, ...params).pipe(
    Effect.flatMap(decodeWith(CountRow)),
    Effect.map((row) => row.count),
  );
}

function ownedAgents(db: SqlDatabase, name: IdentityName): Fails<readonly IdentityName[]> {
  return db.all(SELECT_OWNED, name).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeWith(OwnedRow), { concurrency: 1 })),
    Effect.map(Arr.map((row) => row.name)),
  );
}

function sqlDeleteFound(db: SqlDatabase, identity: Identity): Fails<DeleteIdentityResult> {
  return Effect.gen(function* deleteRow() {
    const check = {
      activeAdmins: yield* countOf(db, COUNT_ACTIVE_ADMINS),
      agents: yield* ownedAgents(db, identity.name),
      identity,
      messages: yield* countOf(db, COUNT_MESSAGES, identity.name, identity.name),
    };
    const refused = deleteRefusal(check);
    if (Option.isSome(refused)) {
      return refused.value;
    }
    yield* db.run(KEEP_AVATAR_TO_REMOVE, identity.name);
    yield* Effect.forEach(DROP_ROWS, (sql) => db.run(sql, identity.name), { concurrency: 1, discard: true });
    return { identity, status: "deleted" } as const;
  });
}

function sqlAvatarRemovals(db: SqlDatabase): AvatarRemovalsSection {
  return {
    avatarsRemoved: (ids) => Effect.forEach(ids, (id) => db.run(DROP_AVATAR_TO_REMOVE, id), ONE_AT_A_TIME),
    avatarsToRemove: (limit) =>
      db.all(SELECT_AVATARS_TO_REMOVE, limit).pipe(
        Effect.flatMap((rows) => Effect.forEach(rows, decodeWith(AvatarToRemoveRow), { concurrency: 1 })),
        Effect.map(Arr.map((row) => row.id)),
      ),
  };
}

function sqlIdentityDeletes(db: SqlDatabase): IdentityDeletesSection {
  return {
    countMessagesBy: (name) => countOf(db, COUNT_MESSAGES, name, name),
    deleteIdentity: (name) =>
      db.transaction(
        Effect.flatMap(db.get(SELECT_IDENTITY, name), (row) => {
          if (Predicate.isUndefined(row)) {
            return Effect.succeed<DeleteIdentityResult>({ status: "not_found" });
          }
          return Effect.flatMap(decodeWith(IdentityRow)(row), (decoded) => sqlDeleteFound(db, toIdentity(decoded)));
        }),
      ),
  };
}

export {
  type AvatarRemovalsSection,
  type AvatarsToRemove,
  type DeleteIdentityResult,
  type IdentityDeletesSection,
  memoryAvatarRemovals,
  memoryRemoveIdentity,
  sqlAvatarRemovals,
  sqlIdentityDeletes,
};

import { Array as Arr, Effect, Predicate, Schema } from "effect";
import { IDENTITY_COLUMNS, IdentityRow, toIdentity } from "./identity-row.ts";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { AvatarId } from "../../../avatars/index.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isAvatarId } from "../../../avatars/index.ts";
import { unreadable } from "./errors.ts";

type SetAvatarResult =
  | { readonly status: "set"; readonly identity: Identity; readonly replaced?: AvatarId }
  | { readonly status: "not_found" };

interface AvatarsSection {
  readonly setAvatar: (name: IdentityName, id: AvatarId) => Fails<SetAvatarResult>;
  readonly avatarInUse: (id: AvatarId) => Fails<boolean>;
}

interface MemoryIdentityMap {
  readonly identities: Map<IdentityName, Identity>;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

const NOT_FOUND: SetAvatarResult = { status: "not_found" };

const SELECT_IDENTITY = `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE name = ?`;

const AvatarIdColumn = Schema.String.pipe(Schema.refine(isAvatarId));

const AvatarRow = Schema.Struct({ avatar: Schema.NullOr(AvatarIdColumn) });

function replacedOf(previous: AvatarId | null | undefined, id: AvatarId): { readonly replaced?: AvatarId } {
  if (Predicate.isNullish(previous) || previous === id) {
    return {};
  }
  return { replaced: previous };
}

function heldAvatar(identity: Identity): AvatarId | null {
  if (Predicate.isUndefined(identity.avatar)) {
    return null;
  }
  return identity.avatar.id;
}

function wears(identity: Identity, id: AvatarId): boolean {
  return Predicate.isNotUndefined(identity.avatar) && identity.avatar.id === id;
}

function memoryAvatars({ identities, open }: MemoryIdentityMap): AvatarsSection {
  return {
    avatarInUse: (id) => open(() => Arr.some([...identities.values()], (found) => wears(found, id))),
    setAvatar: (name, id) =>
      open((): SetAvatarResult => {
        const identity = identities.get(name);
        if (Predicate.isUndefined(identity)) {
          return NOT_FOUND;
        }
        const changed = { ...identity, avatar: { id } };
        identities.set(name, changed);
        return { identity: { ...changed }, ...replacedOf(heldAvatar(identity), id), status: "set" };
      }),
  };
}

function decodeRow(row: unknown): Fails<typeof IdentityRow.Type> {
  return Schema.decodeUnknownEffect(IdentityRow)(row).pipe(Effect.mapError(unreadable));
}

function decodeAvatar(row: unknown): Fails<typeof AvatarRow.Type> {
  return Schema.decodeUnknownEffect(AvatarRow)(row).pipe(Effect.mapError(unreadable));
}

function sqlAvatars(db: SqlDatabase): AvatarsSection {
  return {
    avatarInUse: (id) =>
      Effect.map(db.get("SELECT 1 AS found FROM identities WHERE avatar = ?", id), Predicate.isNotUndefined),
    setAvatar: (name, id) =>
      db.transaction(
        Effect.gen(function* setAvatarRow() {
          const before = yield* db.get("SELECT avatar FROM identities WHERE name = ?", name);
          if (Predicate.isUndefined(before)) {
            return NOT_FOUND;
          }
          const { avatar: previous } = yield* decodeAvatar(before);
          yield* db.run("UPDATE identities SET avatar = ? WHERE name = ?", id, name);
          const row = yield* db.get(SELECT_IDENTITY, name);
          const decoded = yield* decodeRow(row);
          return { identity: toIdentity(decoded), ...replacedOf(previous, id), status: "set" } as const;
        }),
      ),
  };
}

export { type AvatarsSection, memoryAvatars, sqlAvatars };

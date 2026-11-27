import type { Avatar, AvatarId } from "../../../avatars/index.ts";
import type { DisplayName, Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { Effect, Schema } from "effect";
import { isDisplayName, isIdentityName, isOwner } from "../../../identities/index.ts";
import type { Description } from "../../../identities/client.ts";
import type { Fails } from "./errors.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isAvatarId } from "../../../avatars/index.ts";
import { isDescription } from "../../../identities/client.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

type FindIdentity = (name: IdentityName) => Identity | undefined;

const NOT_ADMIN = 0;
const ADMIN = 1;
const ACTIVE = 0;
const DEACTIVATED = 1;

const IDENTITY_COLUMNS =
  "name, kind, owner, admin, created_at, display_name, description, deactivated, brought_in_by, avatar";

const OwnerColumn = Schema.String.pipe(Schema.refine(isOwner));

const DisplayNameColumn = Schema.String.pipe(Schema.refine(isDisplayName));

const DescriptionColumn = Schema.String.pipe(Schema.refine(isDescription));

const IdentityNameColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const AvatarIdColumn = Schema.String.pipe(Schema.refine(isAvatarId));

const sharedColumns = {
  admin: Schema.Literals([NOT_ADMIN, ADMIN]),
  avatar: Schema.NullOr(AvatarIdColumn),
  created_at: IsoTimeSchema,
  deactivated: Schema.Literals([ACTIVE, DEACTIVATED]),
  display_name: Schema.NullOr(DisplayNameColumn),
  name: IdentityNameColumn,
};

const HumanRow = Schema.Struct({
  ...sharedColumns,
  brought_in_by: Schema.optionalKey(Schema.Null),
  description: Schema.optionalKey(Schema.Null),
  kind: Schema.Literal("human"),
  owner: Schema.Null,
});

const AgentRow = Schema.Struct({
  ...sharedColumns,
  brought_in_by: Schema.NullOr(IdentityNameColumn),
  description: Schema.NullOr(DescriptionColumn),
  kind: Schema.Literal("agent"),
  owner: OwnerColumn,
});

const IdentityRow = Schema.Union([HumanRow, AgentRow]);

function displayNameOf(row: typeof IdentityRow.Type): { readonly displayName?: DisplayName } {
  if (row.display_name === null) {
    return {};
  }
  return { displayName: row.display_name };
}

function avatarOf(avatar: AvatarId | null): { readonly avatar?: Avatar } {
  if (avatar === null) {
    return {};
  }
  return { avatar: { id: avatar } };
}

function descriptionOf(description: Description | null): { readonly description?: Description } {
  if (description === null) {
    return {};
  }
  return { description };
}

function broughtInByOf(broughtInBy: IdentityName | null): { readonly broughtInBy?: IdentityName } {
  if (broughtInBy === null) {
    return {};
  }
  return { broughtInBy };
}

function deactivatedOf(row: typeof IdentityRow.Type): { readonly deactivated?: true } {
  if (row.deactivated === DEACTIVATED) {
    return { deactivated: true };
  }
  return {};
}

function toIdentity(row: typeof IdentityRow.Type): Identity {
  const fields = {
    admin: row.admin === ADMIN,
    createdAt: row.created_at,
    name: row.name,
    ...displayNameOf(row),
    ...deactivatedOf(row),
    ...avatarOf(row.avatar),
  };
  if (row.kind === "human") {
    return { ...fields, kind: "human" };
  }
  const described = { ...fields, ...descriptionOf(row.description) };
  return { ...described, ...broughtInByOf(row.brought_in_by), kind: "agent", owner: row.owner };
}

const CountRow = Schema.Struct({ count: Schema.Int });

const NONE = 0;

function broughtInByColumn(identity: Identity): IdentityName | null {
  if (identity.kind === "agent") {
    return identity.broughtInBy ?? null;
  }
  return null;
}

function counted(db: SqlDatabase, sql: string, ...params: readonly string[]): Fails<number> {
  return db.get(sql, ...params).pipe(
    Effect.flatMap((row) => Schema.decodeUnknownEffect(CountRow)(row).pipe(Effect.mapError(unreadable))),
    Effect.map((row) => row.count),
  );
}

function ownerOf(identity: Identity): IdentityName | null {
  if (identity.kind === "agent") {
    return identity.owner;
  }
  return null;
}

function adminColumn(identity: Identity): number {
  if (identity.admin) {
    return ADMIN;
  }
  return NOT_ADMIN;
}

function insertIdentity(db: SqlDatabase): (identity: Identity, hash: TokenHash) => Fails<void> {
  return (identity, hash) =>
    Effect.andThen(
      db.run(
        `INSERT INTO identities (name, kind, owner, admin, created_at, display_name, brought_in_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        identity.name,
        identity.kind,
        ownerOf(identity),
        adminColumn(identity),
        identity.createdAt,
        identity.displayName ?? null,
        broughtInByColumn(identity),
      ),
      db.run("INSERT INTO tokens (token_hash, identity_name, revoked) VALUES (?, ?, FALSE)", hash, identity.name),
    );
}

function revokeTokensOfName(db: SqlDatabase): (name: IdentityName) => Fails<void> {
  return (name) =>
    db.run(`UPDATE tokens SET revoked = TRUE WHERE identity_name = ? AND ${isFalse[db.dialect]("revoked")}`, name);
}

function setOnlyTokenOf(db: SqlDatabase): (identity: Identity, hash: TokenHash) => Fails<void> {
  return (identity, hash) =>
    Effect.gen(function* setOnlyTokenInDatabase() {
      const existing = yield* counted(db, "SELECT count(*) AS count FROM identities WHERE name = ?", identity.name);
      if (existing === NONE) {
        yield* Effect.andThen(
          db.run("DELETE FROM tokens WHERE token_hash = ?", hash),
          insertIdentity(db)(identity, hash),
        );
        return;
      }
      yield* db.run(
        `UPDATE tokens SET revoked = TRUE WHERE identity_name = ? AND ${isFalse[db.dialect]("revoked")} AND token_hash <> ?`,
        identity.name,
        hash,
      );
      yield* db.run(
        `INSERT INTO tokens (token_hash, identity_name, revoked) VALUES (?, ?, FALSE)
       ON CONFLICT (token_hash) DO UPDATE SET identity_name = excluded.identity_name, revoked = FALSE`,
        hash,
        identity.name,
      );
    });
}

export {
  AgentRow,
  type FindIdentity,
  IDENTITY_COLUMNS,
  IdentityRow,
  counted,
  insertIdentity,
  revokeTokensOfName,
  setOnlyTokenOf,
  toIdentity,
};

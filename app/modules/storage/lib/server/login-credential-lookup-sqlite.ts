import { EXPIRED, UNKNOWN, loginCredentialExpiry } from "./login-requests.ts";
import { Effect, Option, Predicate, Schema } from "effect";
import type { Identity, TokenHash } from "../../../identities/index.ts";
import { IdentityRow, toIdentity } from "./identity-row.ts";
import type { LoginCredentialLookup, UseLoginCredential } from "./login-requests.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { unreadable } from "./errors.ts";

const FIND_CREDENTIAL = `SELECT i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name, i.deactivated, i.avatar
  FROM login_credentials AS c JOIN identities AS i ON i.name = c.identity_name WHERE c.hash = ?`;

const LOOK_UP_CREDENTIAL = `SELECT c.last_used_at, i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name,
  i.deactivated, i.avatar
  FROM login_credentials AS c JOIN identities AS i ON i.name = c.identity_name WHERE c.hash = ?`;

const LastUsedRow = Schema.Struct({ last_used_at: IsoTimeSchema });

function rowOf<Decoded, Failure>(decode: (row: unknown) => Effect.Effect<Decoded, Failure>) {
  return (row: unknown): Fails<Option.Option<Decoded>> => {
    if (!Predicate.isObject(row)) {
      return Effect.succeedNone;
    }
    return Effect.mapBoth(decode(row), { onFailure: unreadable, onSuccess: Option.some });
  };
}

const identityRow = rowOf(Schema.decodeUnknownEffect(IdentityRow));
const lastUsedRow = rowOf(Schema.decodeUnknownEffect(LastUsedRow));

function credentialIn(db: SqlDatabase): (hash: TokenHash) => Fails<Option.Option<Identity>> {
  return (hash) => Effect.map(Effect.flatMap(db.get(FIND_CREDENTIAL, hash), identityRow), Option.map(toIdentity));
}

interface FoundCredential {
  readonly identity: Identity;
  readonly lastUsedAt: IsoTime;
}

function foundCredential(db: SqlDatabase, hash: TokenHash): Fails<Option.Option<FoundCredential>> {
  return Effect.gen(function* findCredential() {
    const row = yield* db.get(LOOK_UP_CREDENTIAL, hash);
    const identity = yield* identityRow(row);
    const used = yield* lastUsedRow(row);
    return Option.zipWith(identity, used, (found, { last_used_at: lastUsedAt }) => ({
      identity: toIdentity(found),
      lastUsedAt,
    }));
  });
}

interface SqlLookUp {
  readonly db: SqlDatabase;
  readonly renew: boolean;
  readonly use: UseLoginCredential;
}

function expiredIn({ db, renew, use }: SqlLookUp): Fails<LoginCredentialLookup> {
  const forget = Effect.andThen(
    db.run("DELETE FROM login_credentials WHERE hash = ?", use.hash),
    lineageIn(db).markEnded({ hash: use.hash, now: use.now, why: "expired" }),
  );
  return Effect.as(Effect.when(forget, Effect.succeed(renew)), EXPIRED);
}

function activeIn(
  { db, renew, use }: SqlLookUp,
  { identity, lastUsedAt: usedBefore }: FoundCredential,
): Fails<LoginCredentialLookup> {
  if (!renew) {
    return Effect.succeed({
      expiresAt: loginCredentialExpiry(usedBefore),
      identity,
      lastUsedAt: usedBefore,
      status: "active",
    });
  }
  const expiresAt = loginCredentialExpiry(use.now);
  const renewing = "UPDATE login_credentials SET last_used_at = ?, expires_at = ? WHERE hash = ?";
  return Effect.as(db.run(renewing, use.now, expiresAt, use.hash), {
    expiresAt,
    identity,
    lastUsedAt: use.now,
    status: "active",
  } as const);
}

interface LookUpIn {
  readonly db: SqlDatabase;
  readonly renew: boolean;
}

function lookUpIn({ db, renew }: LookUpIn) {
  return (use: UseLoginCredential): Fails<LoginCredentialLookup> =>
    db.transaction(
      Effect.gen(function* lookUpCredential() {
        const found = yield* foundCredential(db, use.hash);
        if (Option.isNone(found)) {
          return UNKNOWN;
        }
        if (use.now >= loginCredentialExpiry(found.value.lastUsedAt)) {
          return yield* expiredIn({ db, renew, use });
        }
        return yield* activeIn({ db, renew, use }, found.value);
      }),
    );
}

export { credentialIn, lookUpIn, rowOf };

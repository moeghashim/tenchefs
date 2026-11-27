import { Array as Arr, Effect, Option, Schema } from "effect";
import type {
  EndedCredential,
  LineageSection,
  ListedSession,
  LogOutEverywhere,
  NewLineage,
} from "./credential-lineage.ts";
import {
  HashRow,
  NameColumn,
  ONE_AT_A_TIME,
  decodedWith,
  endEach,
  hashesIn,
  liveAmong,
  markEndedIn,
} from "./credential-lineage-sql-ends.ts";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Ending } from "./credential-lineage-sql-ends.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { TRUE } from "./adapters/sql-database.ts";
import { isPublicId } from "../../../logins/index.ts";
import { loginCredentialExpiry } from "./login-requests.ts";
import { madeByOf } from "./credential-lineage.ts";
import { tokenHash } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

const RECORD = `INSERT INTO credential_lineage (hash, public_id, kind, identity_name, parent_hash, made_at, where_from)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

function recordIn(db: SqlDatabase): (row: NewLineage) => Fails<void> {
  return ({ hash, identity, kind, madeAt, parent, publicId, where }) =>
    db.run(RECORD, hash, publicId, kind, identity, parent ?? null, madeAt, where ?? null);
}

function revokeTreeIn(db: SqlDatabase): (hash: TokenHash, now: IsoTime) => Fails<readonly EndedCredential[]> {
  return (hash, now) =>
    Effect.flatMap(hashesIn(db, "SELECT hash FROM credential_lineage WHERE hash = ?", hash), (hashes) =>
      endEach({ db, hashes, now }),
    );
}

interface SqlLineageWrites {
  readonly record: (row: NewLineage) => Fails<void>;
  readonly markEnded: (ending: Ending) => Fails<void>;
  readonly revokeTree: (hash: TokenHash, now: IsoTime) => Fails<readonly EndedCredential[]>;
}

function lineageIn(db: SqlDatabase): SqlLineageWrites {
  return { markEnded: markEndedIn(db), record: recordIn(db), revokeTree: revokeTreeIn(db) };
}

const SessionRow = Schema.Struct({
  hash: Schema.String,
  kind: Schema.Literals(["web", "cli"]),
  last_used_at: IsoTimeSchema,
  made_at: IsoTimeSchema,
  parent_identity: Schema.NullOr(NameColumn),
  parent_kind: Schema.NullOr(Schema.String),
  parent_where: Schema.String,
  public_id: Schema.String.pipe(Schema.refine(isPublicId)),
  token_holder: Schema.NullOr(NameColumn),
  where_from: Schema.String,
});

type SessionRowType = typeof SessionRow.Type;

const LIST_SESSIONS = `SELECT l.public_id, l.kind, COALESCE(l.where_from, 'web browser') AS where_from, l.made_at, c.last_used_at, c.hash,
    p.kind AS parent_kind, COALESCE(p.where_from, 'web browser') AS parent_where, p.identity_name AS parent_identity,
    t.identity_name AS token_holder
  FROM login_credentials AS c
  JOIN credential_lineage AS l ON l.hash = c.hash
  LEFT JOIN credential_lineage AS p ON p.hash = l.parent_hash
  LEFT JOIN tokens AS t ON t.token_hash = l.parent_hash
  WHERE c.identity_name = ? AND c.expires_at > ?
  ORDER BY l.made_at, l.public_id`;

function optional<Value extends string>(value: Value | null): Value | undefined {
  return Option.getOrUndefined(Option.fromNullOr(value));
}

function listedOf(identity: IdentityName, current: TokenHash | undefined) {
  return (row: SessionRowType): ListedSession => {
    const madeBy = madeByOf({
      identity,
      parentIdentity: optional(row.parent_identity),
      parentKind: optional(row.parent_kind),
      parentWhere: row.parent_where,
      tokenHolder: optional(row.token_holder),
    });
    return {
      current: row.hash === current,
      expiresAt: loginCredentialExpiry(row.last_used_at),
      id: row.public_id,
      kind: row.kind,
      lastUsedAt: row.last_used_at,
      madeAt: row.made_at,
      where: row.where_from,
      ...madeBy,
    };
  };
}

function listIn(db: SqlDatabase): LineageSection["listSessions"] {
  return ({ current, identity, now }) =>
    Effect.flatMap(db.all(LIST_SESSIONS, identity, now), (rows) =>
      Effect.mapBoth(
        Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(SessionRow)(row), ONE_AT_A_TIME),
        {
          onFailure: unreadable,
          onSuccess: (decoded: readonly SessionRowType[]) => Arr.map(decoded, listedOf(identity, current)),
        },
      ),
    );
}

const FIND_SESSION = `SELECT l.hash FROM credential_lineage AS l JOIN login_credentials AS c ON c.hash = l.hash
  WHERE l.public_id = ? AND c.identity_name = ? AND c.expires_at > ?`;

const hashRow = decodedWith(HashRow);

function revokeSessionIn(db: SqlDatabase): LineageSection["revokeSession"] {
  return ({ id, identity, now }) =>
    db.transaction(
      Effect.gen(function* revokeSession() {
        const found = yield* Effect.flatMap(db.get(FIND_SESSION, id, identity, now), hashRow);
        if (Option.isNone(found)) {
          return { status: "not_found" } as const;
        }
        const ended = yield* revokeTreeIn(db)(tokenHash(found.value.hash), now);
        return { ended, status: "revoked" } as const;
      }),
    );
}

function belowRevokedTokensIn(db: SqlDatabase): LineageSection["revokeBelowRevokedTokens"] {
  const roots = `SELECT token_hash AS hash FROM tokens WHERE identity_name = ? AND revoked = ${TRUE[db.dialect]}`;
  return (identity, now) =>
    db.transaction(Effect.flatMap(hashesIn(db, roots, identity), (hashes) => endEach({ db, hashes, now })));
}

const PERSON_ROOTS = `SELECT token_hash AS hash FROM tokens WHERE identity_name = ?
    UNION SELECT hash FROM credential_lineage WHERE identity_name = ? AND kind <> 'join code'`;

function credentialsOfIn(db: SqlDatabase): LineageSection["endCredentialsOf"] {
  return (identity, now) =>
    db.transaction(
      Effect.flatMap(hashesIn(db, PERSON_ROOTS, identity, identity), (hashes) => endEach({ db, hashes, now })),
    );
}

const SENT_ROOT = `SELECT token_hash AS hash FROM tokens WHERE token_hash = ?
    UNION SELECT hash FROM credential_lineage WHERE hash = ?`;

const MAKE_ROOT = "UPDATE credential_lineage SET parent_hash = NULL WHERE hash = ?";

function everywhereBut(db: SqlDatabase, { current, identity }: LogOutEverywhere): Fails<readonly TokenHash[]> {
  return Effect.gen(function* everywhereButCurrent() {
    const tree = yield* hashesIn(db, PERSON_ROOTS, identity, identity);
    const sent = Arr.fromNullishOr(current);
    const kept = yield* Effect.forEach(sent, (hash) => hashesIn(db, SENT_ROOT, hash, hash), ONE_AT_A_TIME);
    return Arr.difference(tree, Arr.flatten(kept));
  });
}

function previewIn(db: SqlDatabase): LineageSection["previewLogOutEverywhere"] {
  return (request) =>
    db.transaction(Effect.flatMap(everywhereBut(db, request), (hashes) => liveAmong({ db, hashes, now: request.now })));
}

function logOutEverywhereIn(db: SqlDatabase): LineageSection["logOutEverywhere"] {
  return (request) =>
    db.transaction(
      Effect.gen(function* logOutEverywhere() {
        const hashes = yield* everywhereBut(db, request);
        const ended = yield* endEach({ db, hashes, now: request.now });
        yield* Effect.forEach(Arr.fromNullishOr(request.current), (hash) => db.run(MAKE_ROOT, hash), ONE_AT_A_TIME);
        return ended;
      }),
    );
}

function sqlLineage(db: SqlDatabase): LineageSection {
  return {
    endCredentialsOf: credentialsOfIn(db),
    listSessions: listIn(db),
    logOutEverywhere: logOutEverywhereIn(db),
    previewLogOutEverywhere: previewIn(db),
    revokeBelowRevokedTokens: belowRevokedTokensIn(db),
    revokeSession: revokeSessionIn(db),
  };
}

export { lineageIn, sqlLineage };

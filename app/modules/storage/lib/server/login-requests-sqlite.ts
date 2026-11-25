import { Array as Arr, Effect, Function as Fn, Option, Predicate, Schema } from "effect";
import type {
  CollectLoginRequest,
  LoginCollection,
  LoginRequest,
  LoginRequestsSection,
  NewLoginRequest,
} from "./login-requests.ts";
import { GONE, PENDING, collected } from "./login-requests.ts";
import type { Identity, TokenHash } from "../../../identities/index.ts";
import { IdentityRow, toIdentity } from "./identity-row.ts";
import { isIdentityName, tokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { TRUE } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

const ApproverColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const RequestRow = Schema.Struct({
  approved_by: Schema.NullOr(ApproverColumn),
  expires_at: IsoTimeSchema,
  host: Schema.String,
  user_code: Schema.String,
});

type RequestRowType = typeof RequestRow.Type;

const REQUEST_COLUMNS = "approved_by, expires_at, host, user_code";

const FIND_CREDENTIAL = `SELECT i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name, i.deactivated, i.avatar
  FROM login_credentials AS c JOIN identities AS i ON i.name = c.identity_name WHERE c.hash = ?`;

const FIND_LIVE_BY_HASH = `SELECT ${REQUEST_COLUMNS} FROM login_requests WHERE request_hash = ? AND expires_at > ?`;

const FIND_LIVE_BY_CODE = `SELECT ${REQUEST_COLUMNS} FROM login_requests WHERE user_code = ? AND expires_at > ?`;

const INSERT_REQUEST = `INSERT INTO login_requests (request_hash, user_code, host, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?)`;

const ISSUE_CREDENTIAL = `INSERT INTO login_credentials (hash, identity_name, host, created_at)
  SELECT ?, name, ?, ? FROM identities WHERE name = ?`;

const ISSUE_MADE_WITH = `INSERT INTO login_credentials (hash, identity_name, host, created_at, made_with)
  SELECT ?, name, ?, ?, coalesce((SELECT made_with FROM login_credentials WHERE hash = ?), ?)
  FROM identities WHERE name = ?`;

function madeWithRevokedTokens(db: SqlDatabase): string {
  return `SELECT c.hash FROM login_credentials AS c
    JOIN tokens AS t ON t.token_hash = c.made_with AND t.identity_name = c.identity_name
    WHERE c.identity_name = ? AND t.revoked = ${TRUE[db.dialect]}`;
}

const CredentialHashRow = Schema.Struct({ hash: Schema.String });

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function rowOf<Decoded, Failure>(decode: (row: unknown) => Effect.Effect<Decoded, Failure>) {
  return (row: unknown): Fails<Option.Option<Decoded>> => {
    if (!Predicate.isObject(row)) {
      return Effect.succeedNone;
    }
    return Effect.mapBoth(decode(row), { onFailure: unreadable, onSuccess: Option.some });
  };
}

const requestRow = rowOf(Schema.decodeUnknownEffect(RequestRow));
const identityRow = rowOf(Schema.decodeUnknownEffect(IdentityRow));

function shown(row: RequestRowType): LoginRequest {
  return { approved: row.approved_by !== null, expiresAt: row.expires_at, host: row.host, userCode: row.user_code };
}

interface Queries {
  readonly credential: (hash: TokenHash) => Fails<Option.Option<Identity>>;
  readonly liveByCode: (userCode: string, now: IsoTime) => Fails<Option.Option<RequestRowType>>;
}

function sqlQueries(db: SqlDatabase): Queries {
  return {
    credential: (hash: TokenHash): Fails<Option.Option<Identity>> =>
      Effect.map(Effect.flatMap(db.get(FIND_CREDENTIAL, hash), identityRow), Option.map(toIdentity)),
    liveByCode: (userCode: string, now: IsoTime): Fails<Option.Option<RequestRowType>> =>
      Effect.flatMap(db.get(FIND_LIVE_BY_CODE, userCode, now), requestRow),
  };
}

function addIn(db: SqlDatabase): LoginRequestsSection["addLoginRequest"] {
  const { liveByCode } = sqlQueries(db);
  return (request: NewLoginRequest, now: IsoTime) =>
    db.transaction(
      Effect.gen(function* addRequest() {
        yield* db.run("DELETE FROM login_requests WHERE expires_at <= ?", now);
        const taken = yield* liveByCode(request.userCode, now);
        if (Option.isSome(taken)) {
          return "code_taken" as const;
        }
        const { createdAt, expiresAt, host, requestHash, userCode } = request;
        yield* db.run(INSERT_REQUEST, requestHash, userCode, host, createdAt, expiresAt);
        return "added" as const;
      }),
    );
}

function approveIn(db: SqlDatabase): LoginRequestsSection["approveLoginRequest"] {
  const { liveByCode } = sqlQueries(db);
  return (userCode, approver, now) =>
    db.transaction(
      Effect.gen(function* approveRequest() {
        const found = yield* liveByCode(userCode, now);
        if (Option.isNone(found)) {
          return "not_found" as const;
        }
        const approve = "UPDATE login_requests SET approved_by = coalesce(approved_by, ?) WHERE user_code = ?";
        yield* db.run(approve, approver, userCode);
        return "approved" as const;
      }),
    );
}

function issueIn(db: SqlDatabase, { credentialHash, now, requestHash }: CollectLoginRequest) {
  const { credential } = sqlQueries(db);
  return ({ approved_by: approver, host }: RequestRowType): Fails<LoginCollection> =>
    Effect.gen(function* issueCredential() {
      yield* db.run("DELETE FROM login_requests WHERE request_hash = ?", requestHash);
      yield* db.run(ISSUE_CREDENTIAL, credentialHash, host, now, approver);
      const issued = yield* credential(credentialHash);
      return Option.match(issued, { onNone: Fn.constant(GONE), onSome: collected });
    });
}

function collectIn(db: SqlDatabase): LoginRequestsSection["collectLoginRequest"] {
  return (collect) =>
    db.transaction(
      Effect.gen(function* collectRequest() {
        const found = yield* Effect.flatMap(db.get(FIND_LIVE_BY_HASH, collect.requestHash, collect.now), requestRow);
        if (Option.isNone(found)) {
          return GONE;
        }
        if (found.value.approved_by === null) {
          return PENDING;
        }
        return yield* issueIn(db, collect)(found.value);
      }),
    );
}

function issueStraightIn(db: SqlDatabase): LoginRequestsSection["issueLoginCredential"] {
  const { credential } = sqlQueries(db);
  return ({ credentialHash, host, identity, madeWith, now }) =>
    db.transaction(
      Effect.gen(function* issueCredential() {
        yield* db.run(ISSUE_MADE_WITH, credentialHash, host, now, madeWith, madeWith, identity);
        const issued = yield* credential(credentialHash);
        return Option.getOrUndefined(issued);
      }),
    );
}

function revokeIn(db: SqlDatabase): LoginRequestsSection["revokeLoginCredential"] {
  return (hash) =>
    db.transaction(
      Effect.gen(function* revokeCredential() {
        const found = yield* db.get("SELECT hash FROM login_credentials WHERE hash = ?", hash);
        yield* db.run("DELETE FROM login_credentials WHERE hash = ?", hash);
        return Predicate.isObject(found);
      }),
    );
}

function revokeMadeWithRevokedIn(db: SqlDatabase): LoginRequestsSection["revokeLoginCredentialsMadeWithRevokedTokens"] {
  return (identity) =>
    db.transaction(
      Effect.gen(function* revokeMadeWithRevoked() {
        const rows = yield* db.all(madeWithRevokedTokens(db), identity);
        const decoded = yield* Effect.mapError(
          Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(CredentialHashRow)(row), ONE_AT_A_TIME),
          unreadable,
        );
        const hashes = Arr.map(decoded, ({ hash }) => tokenHash(hash));
        yield* Effect.forEach(hashes, (hash) => db.run("DELETE FROM login_credentials WHERE hash = ?", hash), {
          ...ONE_AT_A_TIME,
          discard: true,
        });
        return hashes;
      }),
    );
}

function sqlLoginRequests(db: SqlDatabase): LoginRequestsSection {
  const { credential, liveByCode } = sqlQueries(db);
  return {
    addLoginRequest: addIn(db),
    approveLoginRequest: approveIn(db),
    collectLoginRequest: collectIn(db),
    findLoginCredential: (hash) => Effect.map(credential(hash), Option.getOrUndefined),
    findLoginRequest: (userCode, now) =>
      Effect.map(liveByCode(userCode, now), (row) => Option.getOrUndefined(Option.map(row, shown))),
    issueLoginCredential: issueStraightIn(db),
    revokeLoginCredential: revokeIn(db),
    revokeLoginCredentialsMadeWithRevokedTokens: revokeMadeWithRevokedIn(db),
  };
}

export { sqlLoginRequests };

import type {
  CollectLoginRequest,
  LoginCollection,
  LoginRequest,
  LoginRequestsSection,
  NewLoginRequest,
} from "./login-requests.ts";
import { Effect, Function as Fn, Option, Predicate, Schema, pipe } from "effect";
import { GONE, PENDING, collected, loginCredentialExpiry, originColumns, originOf } from "./login-requests.ts";
import type { Identity, TokenHash } from "../../../identities/index.ts";
import { credentialIn, lookUpIn, rowOf } from "./login-credential-lookup-sqlite.ts";
import { isIdentityName, tokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { NewLineage } from "./credential-lineage.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { newPublicId } from "./credential-lineage.ts";

const ApproverColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const RequestRow = Schema.Struct({
  approved_by: Schema.NullOr(ApproverColumn),
  approved_with: Schema.NullOr(Schema.String),
  client_ip: Schema.NullOr(Schema.String),
  created_at: IsoTimeSchema,
  expires_at: IsoTimeSchema,
  host: Schema.String,
  kind: Schema.Literals(["web", "cli"]),
  user_agent: Schema.NullOr(Schema.String),
  user_code: Schema.String,
});

type RequestRowType = typeof RequestRow.Type;

const REQUEST_COLUMNS =
  "approved_by, approved_with, client_ip, created_at, expires_at, host, kind, user_agent, user_code";

const FIND_LIVE_BY_HASH = `SELECT ${REQUEST_COLUMNS} FROM login_requests
  WHERE request_hash = ? AND kind = ? AND expires_at > ?`;

const APPROVE = `UPDATE login_requests
  SET approved_with = CASE WHEN approved_by IS NULL THEN ? ELSE approved_with END, approved_by = coalesce(approved_by, ?)
  WHERE user_code = ?`;

const FIND_LIVE_BY_CODE = `SELECT ${REQUEST_COLUMNS} FROM login_requests WHERE user_code = ? AND expires_at > ?`;

const INSERT_REQUEST = `INSERT INTO login_requests
  (request_hash, user_code, kind, host, created_at, expires_at, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const ISSUE_CREDENTIAL = `INSERT INTO login_credentials (hash, identity_name, host, created_at, last_used_at, expires_at)
  SELECT ?, name, ?, ?, ?, ? FROM identities WHERE name = ?`;

const requestRow = rowOf(Schema.decodeUnknownEffect(RequestRow));
function shown(row: RequestRowType): LoginRequest {
  return {
    ...originOf({ clientIp: row.client_ip, userAgent: row.user_agent }),
    approved: row.approved_by !== null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    host: row.host,
    userCode: row.user_code,
  };
}

interface Queries {
  readonly credential: (hash: TokenHash) => Fails<Option.Option<Identity>>;
  readonly liveByCode: (userCode: string, now: IsoTime) => Fails<Option.Option<RequestRowType>>;
}

function sqlQueries(db: SqlDatabase): Queries {
  return {
    credential: credentialIn(db),
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
        const { createdAt, expiresAt, host, kind = "cli", requestHash, userCode } = request;
        const columns = [requestHash, userCode, kind, host, createdAt, expiresAt, ...originColumns(request)];
        yield* db.run(INSERT_REQUEST, ...columns);
        return "added" as const;
      }),
    );
}

function approveIn(db: SqlDatabase): LoginRequestsSection["approveLoginRequest"] {
  const { liveByCode } = sqlQueries(db);
  return ({ approvedWith, approver, now, userCode }) =>
    db.transaction(
      Effect.gen(function* approveRequest() {
        const found = yield* liveByCode(userCode, now);
        if (Option.isNone(found)) {
          return "not_found" as const;
        }
        yield* db.run(APPROVE, approvedWith ?? null, approver, userCode);
        return "approved" as const;
      }),
    );
}

interface Issuing {
  readonly collect: CollectLoginRequest;
  readonly publicId: NewLineage["publicId"];
}

function parentOf(approvedWith: string | null): TokenHash | undefined {
  return pipe(Option.fromNullOr(approvedWith), Option.map(tokenHash), Option.getOrUndefined);
}

function issueIn(db: SqlDatabase, { collect, publicId }: Issuing) {
  const { credential } = sqlQueries(db);
  const { credentialHash, now, requestHash } = collect;
  return ({ approved_by: approver, approved_with: approvedWith, host, kind }: RequestRowType): Fails<LoginCollection> =>
    Effect.gen(function* issueCredential() {
      yield* db.run("DELETE FROM login_requests WHERE request_hash = ?", requestHash);
      yield* db.run(ISSUE_CREDENTIAL, credentialHash, host, now, now, loginCredentialExpiry(now), approver);
      const issued = yield* credential(credentialHash);
      function recorded(identity: Identity): Fails<LoginCollection> {
        return Effect.as(
          lineageIn(db).record({
            hash: credentialHash,
            identity: identity.name,
            kind,
            madeAt: now,
            parent: parentOf(approvedWith),
            publicId,
            where: host,
          }),
          collected(identity),
        );
      }
      return yield* Option.match(issued, { onNone: Fn.constant(Effect.succeed(GONE)), onSome: recorded });
    });
}

function collectIn(db: SqlDatabase): LoginRequestsSection["collectLoginRequest"] {
  return (collect) =>
    Effect.flatMap(newPublicId, (publicId) =>
      db.transaction(
        Effect.gen(function* collectRequest() {
          const { kind = "cli", now, requestHash } = collect;
          const found = yield* Effect.flatMap(db.get(FIND_LIVE_BY_HASH, requestHash, kind, now), requestRow);
          if (Option.isNone(found)) {
            return GONE;
          }
          if (found.value.approved_by === null) {
            return PENDING;
          }
          return yield* issueIn(db, { collect, publicId })(found.value);
        }),
      ),
    );
}

function issueStraightIn(db: SqlDatabase): LoginRequestsSection["issueLoginCredential"] {
  const { credential } = sqlQueries(db);
  return ({ credentialHash, host, identity, now, parent }) =>
    Effect.flatMap(newPublicId, (publicId) =>
      db.transaction(
        Effect.gen(function* issueCredential() {
          const expiresAt = loginCredentialExpiry(now);
          yield* db.run(ISSUE_CREDENTIAL, credentialHash, host, now, now, expiresAt, identity);
          const issued = yield* credential(credentialHash);
          if (Option.isSome(issued)) {
            yield* lineageIn(db).record({
              hash: credentialHash,
              identity,
              kind: "web",
              madeAt: now,
              parent,
              publicId,
              where: host,
            });
          }
          return Option.getOrUndefined(issued);
        }),
      ),
    );
}

function revokeIn(db: SqlDatabase): LoginRequestsSection["revokeLoginCredential"] {
  return (hash, now) =>
    db.transaction(
      Effect.gen(function* revokeCredential() {
        const found = yield* db.get("SELECT hash FROM login_credentials WHERE hash = ?", hash);
        yield* db.run("DELETE FROM login_credentials WHERE hash = ?", hash);
        yield* lineageIn(db).markEnded({ hash, now, why: "logged out" });
        return Predicate.isObject(found);
      }),
    );
}

function sqlLoginRequests(db: SqlDatabase): LoginRequestsSection {
  const { credential, liveByCode } = sqlQueries(db);
  return {
    addLoginRequest: addIn(db),
    approveLoginRequest: approveIn(db),
    checkLoginCredential: lookUpIn({ db, renew: false }),
    collectLoginRequest: collectIn(db),
    findLoginCredential: (hash) => Effect.map(credential(hash), Option.getOrUndefined),
    findLoginRequest: (userCode, now) =>
      Effect.map(liveByCode(userCode, now), (row) => Option.getOrUndefined(Option.map(row, shown))),
    issueLoginCredential: issueStraightIn(db),
    revokeLoginCredential: revokeIn(db),
    useLoginCredential: lookUpIn({ db, renew: true }),
  };
}

export { sqlLoginRequests };

import type {
  AgentJoinCollection,
  AgentJoinRequest,
  AgentJoinRequestsSection,
  CollectAgentJoinRequest,
  NewAgentJoinRequest,
  PendingAgentJoinRequest,
} from "./agent-join-requests.ts";
import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import { DENIED, GONE, PENDING, collectionOf, sessionToIssue } from "./agent-join-requests.ts";
import { agentSessionIssuer, sqlAgentSessions } from "./agent-sessions-sqlite.ts";
import type { AgentSessionsSection } from "./agent-sessions.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { sqlJoinCodes } from "./join-codes-sqlite.ts";
import { unreadable } from "./errors.ts";

const NameColumn = Schema.String.pipe(Schema.refine(isIdentityName));
const NO = 0;
const YES = 1;

const RequestRow = Schema.Struct({
  agent: NameColumn,
  created: Schema.NullOr(Schema.Literals([NO, YES])),
  denied_at: Schema.NullOr(IsoTimeSchema),
  expires_at: IsoTimeSchema,
  force: Schema.NullOr(Schema.Literals([NO, YES])),
  host: Schema.String,
  idle_expiry: Schema.NullOr(Schema.String),
  idle_seconds: Schema.NullOr(Schema.Int),
  joins: Schema.NullOr(NameColumn),
  session_url: Schema.NullOr(Schema.String),
  user_code: Schema.String,
});

type RequestRowType = typeof RequestRow.Type;

const PendingRow = Schema.Struct({
  agent: NameColumn,
  created_at: IsoTimeSchema,
  expires_at: IsoTimeSchema,
  host: Schema.String,
  user_code: Schema.String,
});

const LIST_PENDING = `SELECT agent, created_at, expires_at, host, user_code FROM agent_join_requests
  WHERE joins IS NULL AND denied_at IS NULL AND expires_at > ? ORDER BY created_at, user_code`;

const decodePendingRows = Schema.decodeUnknownEffect(Schema.Array(PendingRow));

const COLUMNS =
  "agent, created, denied_at, expires_at, force, host, idle_expiry, idle_seconds, joins, session_url, user_code";

const FIND_LIVE_BY_HASH = `SELECT ${COLUMNS} FROM agent_join_requests WHERE request_hash = ? AND expires_at > ?`;

const FIND_LIVE_BY_CODE = `SELECT ${COLUMNS} FROM agent_join_requests WHERE user_code = ? AND expires_at > ?`;

const INSERT_REQUEST = `INSERT INTO agent_join_requests
  (request_hash, user_code, agent, host, idle_expiry, session_url, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const APPROVE = `UPDATE agent_join_requests SET joins = ?, created = ?, idle_seconds = ?, force = ?
  WHERE user_code = ? AND joins IS NULL`;

const DENY = "UPDATE agent_join_requests SET denied_at = ? WHERE user_code = ?";

const decodeRow = Schema.decodeUnknownEffect(RequestRow);

function requestRow(row: unknown): Fails<Option.Option<RequestRowType>> {
  if (!Predicate.isObject(row)) {
    return Effect.succeedNone;
  }
  return Effect.mapBoth(decodeRow(row), { onFailure: unreadable, onSuccess: Option.some });
}

function shown(row: RequestRowType): AgentJoinRequest {
  const view = {
    agent: row.agent,
    approved: row.joins !== null,
    expiresAt: row.expires_at,
    host: row.host,
    userCode: row.user_code,
  };
  if (row.idle_expiry === null) {
    return view;
  }
  return { ...view, idleExpiry: row.idle_expiry };
}

function pendingIn(db: SqlDatabase): AgentJoinRequestsSection["listPendingAgentJoinRequests"] {
  return (now) =>
    Effect.flatMap(db.all(LIST_PENDING, now), (rows) =>
      Effect.mapBoth(decodePendingRows(rows), {
        onFailure: unreadable,
        onSuccess: (pending): readonly PendingAgentJoinRequest[] =>
          Arr.map(pending, (row) => ({
            agent: row.agent,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            host: row.host,
            userCode: row.user_code,
          })),
      }),
    );
}

function liveByCode(db: SqlDatabase, userCode: string, now: IsoTime): Fails<Option.Option<RequestRowType>> {
  return Effect.flatMap(db.get(FIND_LIVE_BY_CODE, userCode, now), requestRow);
}

function undeniedByCode(db: SqlDatabase, userCode: string, now: IsoTime): Fails<Option.Option<RequestRowType>> {
  return Effect.map(
    liveByCode(db, userCode, now),
    Option.filter((row) => row.denied_at === null),
  );
}

function addIn(db: SqlDatabase): AgentJoinRequestsSection["addAgentJoinRequest"] {
  return (request: NewAgentJoinRequest, now: IsoTime) =>
    db.transaction(
      Effect.gen(function* addRequest() {
        yield* db.run("DELETE FROM agent_join_requests WHERE expires_at <= ?", now);
        const taken = yield* liveByCode(db, request.userCode, now);
        if (Option.isSome(taken)) {
          return "code_taken" as const;
        }
        const {
          agent,
          createdAt,
          expiresAt,
          host,
          idleExpiry = null,
          requestHash,
          sessionUrl = null,
          userCode,
        } = request;
        yield* db.run(INSERT_REQUEST, requestHash, userCode, agent, host, idleExpiry, sessionUrl, createdAt, expiresAt);
        return "added" as const;
      }),
    );
}

function approveIn(db: SqlDatabase): AgentJoinRequestsSection["approveAgentJoinRequest"] {
  return (userCode, { created, force, idleSeconds, identity }, now) =>
    db.transaction(
      Effect.gen(function* approveRequest() {
        const found = yield* undeniedByCode(db, userCode, now);
        if (Option.isNone(found)) {
          return "not_found" as const;
        }
        yield* db.run(APPROVE, identity, Number(created), idleSeconds, Number(force), userCode);
        return "approved" as const;
      }),
    );
}

function denyIn(db: SqlDatabase): AgentJoinRequestsSection["denyAgentJoinRequest"] {
  return (userCode, now) =>
    db.transaction(
      Effect.gen(function* denyRequest() {
        const found = yield* undeniedByCode(db, userCode, now);
        if (Option.isNone(found) || found.value.joins !== null) {
          return "not_found" as const;
        }
        yield* db.run(DENY, now, userCode);
        return "denied" as const;
      }),
    );
}

function issueIn(db: SqlDatabase, collect: CollectAgentJoinRequest) {
  return (row: RequestRowType, identity: NonNullable<RequestRowType["joins"]>): Fails<AgentJoinCollection> =>
    Effect.gen(function* issueAgentSession() {
      yield* db.run("DELETE FROM agent_join_requests WHERE request_hash = ?", collect.requestHash);
      const created = row.created === YES;
      const approval = { created, force: row.force === YES, identity, idleSeconds: Number(row.idle_seconds) };
      const issue = sessionToIssue({ approval, collect, host: row.host, sessionUrl: row.session_url });
      const result = yield* agentSessionIssuer(db)(issue);
      return collectionOf({ created, issue, result });
    });
}

function collectIn(db: SqlDatabase): AgentJoinRequestsSection["collectAgentJoinRequest"] {
  return (collect) =>
    db.transaction(
      Effect.gen(function* collectRequest() {
        const found = yield* Effect.flatMap(db.get(FIND_LIVE_BY_HASH, collect.requestHash, collect.now), requestRow);
        if (Option.isNone(found)) {
          return GONE;
        }
        if (found.value.denied_at !== null) {
          return DENIED;
        }
        if (found.value.joins === null) {
          return PENDING;
        }
        return yield* issueIn(db, collect)(found.value, found.value.joins);
      }),
    );
}

function sqliteAgentJoinRequests(db: SqlDatabase): AgentJoinRequestsSection {
  return {
    addAgentJoinRequest: addIn(db),
    approveAgentJoinRequest: approveIn(db),
    collectAgentJoinRequest: collectIn(db),
    denyAgentJoinRequest: denyIn(db),
    findAgentJoinRequest: (userCode, now) =>
      Effect.map(undeniedByCode(db, userCode, now), (row) => Option.getOrUndefined(Option.map(row, shown))),
    listPendingAgentJoinRequests: pendingIn(db),
  };
}

function sqlAgentSessionSections(
  db: SqlDatabase,
): AgentSessionsSection & AgentJoinRequestsSection & ReturnType<typeof sqlJoinCodes> {
  return { ...sqlAgentSessions(db), ...sqliteAgentJoinRequests(db), ...sqlJoinCodes(db) };
}

export { sqlAgentSessionSections };

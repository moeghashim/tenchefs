import type {
  AgentAt,
  AgentSessionsSection,
  IssueAgentSession,
  IssueAgentSessionResult,
  LiveAgentSession,
  UseAgentSession,
  UseAgentSessionResult,
} from "./agent-sessions.ts";
import { AgentRow, toIdentity } from "./identity-row.ts";
import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import { FALSE, TRUE, isFalse } from "./adapters/sql-database.ts";
import { isLive, listedSession, renewedExpiry } from "./agent-sessions.ts";
import type { EndedCredential } from "./credential-lineage.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { StorageUnavailable } from "./errors.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { newPublicId } from "./credential-lineage.ts";
import { tokenHash } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const NOT_REVOKED = 0;
const REVOKED = 1;
const DEACTIVATED = 1;

const LiveRow = Schema.Struct({ expires_at: IsoTimeSchema });

const ListedRow = Schema.Struct({
  expires_at: IsoTimeSchema,
  host: Schema.NullOr(Schema.String),
  issued_at: IsoTimeSchema,
  last_used_at: Schema.NullOr(IsoTimeSchema),
  session_url: Schema.NullOr(Schema.String),
});

const SessionRow = Schema.Struct({
  ...AgentRow.fields,
  expires_at: IsoTimeSchema,
  idle_seconds: Schema.Int,
  revoked: Schema.Literals([NOT_REVOKED, REVOKED]),
});

interface SessionSql {
  readonly findLive: string;
  readonly findListed: string;
  readonly findLiveHashes: string;
  readonly revokeLive: string;
  readonly insert: string;
  readonly revoke: string;
}

function sessionSql(dialect: SqlDatabase["dialect"]): SessionSql {
  const live = `identity_name = ? AND ${isFalse[dialect]("revoked")} AND expires_at > ?`;
  return {
    findListed: `SELECT issued_at, expires_at, last_used_at, host, session_url FROM agent_session_tokens
  WHERE ${live} ORDER BY expires_at DESC LIMIT 1`,
    findLive: `SELECT expires_at FROM agent_session_tokens
  WHERE ${live} ORDER BY expires_at DESC LIMIT 1`,
    findLiveHashes: `SELECT hash FROM agent_session_tokens WHERE ${live} ORDER BY hash`,
    insert: `INSERT INTO agent_session_tokens (hash, identity_name, issued_at, expires_at, idle_seconds, revoked, host, session_url)
        VALUES (?, ?, ?, ?, ?, ${FALSE[dialect]}, ?, ?)`,
    revoke: `UPDATE agent_session_tokens SET revoked = ${TRUE[dialect]} WHERE hash = ?`,
    revokeLive: `UPDATE agent_session_tokens SET revoked = ${TRUE[dialect]} WHERE ${live}`,
  };
}

const SESSION_SQL: DialectForms<SessionSql> = { postgres: sessionSql("postgres"), sqlite: sessionSql("sqlite") };

const FIND_SESSION = `SELECT i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name, i.description, i.deactivated, i.brought_in_by, i.avatar,
  t.expires_at, t.idle_seconds, t.revoked
  FROM agent_session_tokens AS t JOIN identities AS i ON i.name = t.identity_name WHERE t.hash = ?`;

function liveOf(row: unknown): Fails<Option.Option<typeof LiveRow.Type>> {
  if (!Predicate.isObject(row)) {
    return Effect.succeedNone;
  }
  return Schema.decodeUnknownEffect(LiveRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: Option.some }),
  );
}

function sessionOf(row: unknown): Fails<Option.Option<typeof SessionRow.Type>> {
  if (!Predicate.isObject(row)) {
    return Effect.succeedNone;
  }
  return Schema.decodeUnknownEffect(SessionRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: Option.some }),
  );
}

function listed(row: typeof ListedRow.Type): LiveAgentSession {
  return listedSession({
    expiresAt: row.expires_at,
    host: Option.fromNullOr(row.host),
    issuedAt: row.issued_at,
    lastUsedAt: Option.fromNullOr(row.last_used_at),
    sessionUrl: Option.fromNullOr(row.session_url),
  });
}

function findListed(db: SqlDatabase, { identity, now }: AgentAt): Fails<Option.Option<LiveAgentSession>> {
  return db.get(SESSION_SQL[db.dialect].findListed, identity, now).pipe(
    Effect.flatMap((row) => {
      if (!Predicate.isObject(row)) {
        return Effect.succeedNone;
      }
      return Schema.decodeUnknownEffect(ListedRow)(row).pipe(
        Effect.mapBoth({ onFailure: unreadable, onSuccess: (decoded) => Option.some(listed(decoded)) }),
      );
    }),
  );
}

const HashRow = Schema.Struct({ hash: Schema.String });

function revokeLive(db: SqlDatabase, { identity, now }: AgentAt): Fails<readonly EndedCredential[]> {
  return db.transaction(
    Effect.gen(function* revokeLiveSession() {
      const rows = yield* db.all(SESSION_SQL[db.dialect].findLiveHashes, identity, now);
      const live = yield* Effect.mapError(
        Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(HashRow)(row), ONE_AT_A_TIME),
        unreadable,
      );
      const ended = yield* Effect.forEach(
        live,
        ({ hash }) => lineageIn(db).revokeTree(tokenHash(hash), now),
        ONE_AT_A_TIME,
      );
      return Arr.flatten(ended);
    }),
  );
}

function issue(db: SqlDatabase, request: IssueAgentSession): Fails<IssueAgentSessionResult> {
  const { force, session } = request;
  return Effect.gen(function* issueAgentSession() {
    const row = yield* db.get(SESSION_SQL[db.dialect].findLive, session.identity, session.issuedAt);
    const live = yield* liveOf(row);
    if (Option.isSome(live) && !force) {
      return { expiresAt: live.value.expires_at, status: "live" } as const;
    }
    yield* db.run(SESSION_SQL[db.dialect].revokeLive, session.identity, session.issuedAt);
    yield* db.run(
      SESSION_SQL[db.dialect].insert,
      session.hash,
      session.identity,
      session.issuedAt,
      session.expiresAt,
      session.idleSeconds,
      session.host ?? null,
      session.sessionUrl ?? null,
    );
    yield* lineageIn(db).record({
      hash: session.hash,
      identity: session.identity,
      kind: "agent session",
      madeAt: session.issuedAt,
      parent: request.parent,
      publicId: yield* newPublicId,
      where: session.host,
    });
    return { status: "issued" } as const;
  });
}

function useFound(db: SqlDatabase, { hash, now }: UseAgentSession) {
  return (session: typeof SessionRow.Type): Fails<UseAgentSessionResult> => {
    if (session.deactivated === DEACTIVATED) {
      return Effect.succeed({ status: "deactivated" });
    }
    if (session.revoked === REVOKED) {
      return Effect.succeed({ status: "revoked" });
    }
    if (!isLive(now)({ expiresAt: session.expires_at, revoked: false })) {
      return Effect.succeed({ status: "expired" });
    }
    const expiresAt = renewedExpiry({ idleSeconds: session.idle_seconds, now });
    return Effect.as(
      db.run("UPDATE agent_session_tokens SET expires_at = ?, last_used_at = ? WHERE hash = ?", expiresAt, now, hash),
      {
        expiresAt,
        identity: toIdentity(session),
        status: "active",
      },
    );
  };
}

const UNKNOWN: Fails<UseAgentSessionResult> = Effect.succeed({ status: "unknown" });

function use(db: SqlDatabase, request: UseAgentSession): Fails<UseAgentSessionResult> {
  const renew = useFound(db, request);
  return db
    .get(FIND_SESSION, request.hash)
    .pipe(Effect.flatMap(sessionOf), Effect.flatMap(Option.match({ onNone: () => UNKNOWN, onSome: renew })));
}

function sqlAgentSessions(db: SqlDatabase): AgentSessionsSection {
  return {
    findLiveAgentSession: (at) => findListed(db, at),
    issueAgentSession: (request) => db.transaction(issue(db, request)),
    revokeAgentSession: (hash, now) =>
      db.transaction(
        Effect.andThen(
          db.run(SESSION_SQL[db.dialect].revoke, hash),
          lineageIn(db).markEnded({ hash, now, why: "logged out" }),
        ),
      ),
    revokeLiveAgentSession: (at) => revokeLive(db, at),
    useAgentSession: (request) => db.transaction(use(db, request)),
  };
}

function agentSessionIssuer(db: SqlDatabase): (request: IssueAgentSession) => Fails<IssueAgentSessionResult> {
  return (request) => issue(db, request);
}

export { agentSessionIssuer, sqlAgentSessions };

import type {
  AgentAt,
  AgentSessionsSection,
  IssueAgentSession,
  IssueAgentSessionResult,
  LiveAgentSession,
  StoredAgentSession,
  UseAgentSession,
  UseAgentSessionResult,
} from "./agent-sessions.ts";
import { Array as Arr, Effect, Option } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { isLive, listedSession, renewedExpiry } from "./agent-sessions.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryState } from "./memory-state.ts";
import type { StorageUnavailable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface Kept extends StoredAgentSession {
  readonly revoked: boolean;
  readonly lastUsedAt?: IsoTime;
}

type Sessions = Map<TokenHash, Kept>;

interface MemoryAgentSessions extends AgentSessionsSection {
  readonly revokeAgentSessionsOf: (identity: IdentityName) => Effect.Effect<void>;
  readonly dropAgentSessionsOf: (identity: IdentityName) => Effect.Effect<void>;
}

interface MemoryAgentSessionsOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
}

interface Found {
  readonly kept: Kept;
  readonly identity: Identity;
}

function liveOf(sessions: Sessions, identity: IdentityName, now: IsoTime): readonly Kept[] {
  return Arr.filter([...sessions.values()], (kept) => kept.identity === identity && isLive(now)(kept));
}

function revoke(sessions: Sessions, kept: Kept): void {
  sessions.set(kept.hash, { ...kept, revoked: true });
}

function issue(sessions: Sessions, { force, session }: IssueAgentSession): IssueAgentSessionResult {
  const live = liveOf(sessions, session.identity, session.issuedAt);
  if (Arr.isReadonlyArrayNonEmpty(live) && !force) {
    return { expiresAt: Arr.headNonEmpty(live).expiresAt, status: "live" };
  }
  for (const kept of live) {
    revoke(sessions, kept);
  }
  sessions.set(session.hash, { ...session, revoked: false });
  return { status: "issued" };
}

function listed({ expiresAt, host, issuedAt, lastUsedAt, sessionUrl }: Kept): LiveAgentSession {
  return listedSession({
    expiresAt,
    host: Option.fromUndefinedOr(host),
    issuedAt,
    lastUsedAt: Option.fromUndefinedOr(lastUsedAt),
    sessionUrl: Option.fromUndefinedOr(sessionUrl),
  });
}

function revokeLive(sessions: Sessions, { identity, now }: AgentAt): boolean {
  const live = liveOf(sessions, identity, now);
  for (const kept of live) {
    revoke(sessions, kept);
  }
  return Arr.isReadonlyArrayNonEmpty(live);
}

function renewKept(sessions: Sessions, { identity, kept }: Found, now: IsoTime): UseAgentSessionResult {
  if (identity.deactivated === true) {
    return { status: "deactivated" };
  }
  if (kept.revoked) {
    return { status: "revoked" };
  }
  if (!isLive(now)(kept)) {
    return { status: "expired" };
  }
  const expiresAt = renewedExpiry({ idleSeconds: kept.idleSeconds, now });
  sessions.set(kept.hash, { ...kept, expiresAt, lastUsedAt: now });
  return { expiresAt, identity: { ...identity }, status: "active" };
}

function memoryAgentSessions({ findIdentity, state }: MemoryAgentSessionsOptions): MemoryAgentSessions {
  const sessions: Sessions = new Map();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function found(hash: TokenHash): Option.Option<Found> {
    return Option.flatMap(Option.fromNullishOr(sessions.get(hash)), (kept) =>
      Option.map(Option.fromNullishOr(findIdentity(kept.identity)), (identity) => ({ identity, kept })),
    );
  }
  function used({ hash, now }: UseAgentSession): UseAgentSessionResult {
    return Option.match(found(hash), {
      onNone: () => ({ status: "unknown" }),
      onSome: (each) => renewKept(sessions, each, now),
    });
  }
  return {
    dropAgentSessionsOf: (identity) =>
      Effect.sync(() => {
        for (const kept of Arr.filter([...sessions.values()], (each) => each.identity === identity)) {
          sessions.delete(kept.hash);
        }
      }),
    findLiveAgentSession: ({ identity, now }) =>
      open(() => Option.map(Arr.head(liveOf(sessions, identity, now)), listed)),
    issueAgentSession: (request) => open(() => issue(sessions, request)),
    revokeAgentSession: (hash) =>
      open(() => {
        for (const kept of Option.toArray(Option.fromNullishOr(sessions.get(hash)))) {
          revoke(sessions, kept);
        }
      }),
    revokeAgentSessionsOf: (identity) =>
      Effect.sync(() => {
        for (const kept of Arr.filter([...sessions.values()], (each) => each.identity === identity)) {
          revoke(sessions, kept);
        }
      }),
    revokeLiveAgentSession: (at) => open(() => revokeLive(sessions, at)),
    useAgentSession: (request) => open(() => used(request)),
  };
}

export { memoryAgentSessions };

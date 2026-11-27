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
import type { Ender, MemoryLineage } from "./credential-lineage-memory.ts";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { isLive, listedSession, renewedExpiry } from "./agent-sessions.ts";
import type { EndedCredential } from "./credential-lineage.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryState } from "./memory-state.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { newPublicId } from "./credential-lineage.ts";

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

function allOf(sessions: Sessions, identity: IdentityName): readonly Kept[] {
  return Arr.filter([...sessions.values()], (each) => each.identity === identity);
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

function unrevoked(sessions: Sessions, hash: TokenHash): Option.Option<Kept> {
  return Option.filter(Option.fromUndefinedOr(sessions.get(hash)), (kept) => !kept.revoked);
}

function enderOf(sessions: Sessions): Ender {
  return {
    end: (hash) => {
      for (const kept of Option.toArray(unrevoked(sessions, hash))) {
        revoke(sessions, kept);
      }
    },
    live: (hash, now) =>
      Option.map(
        Option.filter(unrevoked(sessions, hash), (kept) => now < kept.expiresAt),
        (kept): EndedCredential => ({ hash, identity: kept.identity, kind: "agent session" }),
      ),
  };
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

interface RevokeLive {
  readonly lineage: MemoryLineage;
  readonly sessions: Sessions;
  readonly at: AgentAt;
}

function revokeLive({ at: { identity, now }, lineage, sessions }: RevokeLive): readonly EndedCredential[] {
  return Arr.flatMap(liveOf(sessions, identity, now), ({ hash }) => lineage.revokeTree(hash, now));
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

function usedIn(sessions: Sessions, findIdentity: FindIdentity): (use: UseAgentSession) => UseAgentSessionResult {
  function found(hash: TokenHash): Option.Option<Found> {
    return Option.flatMap(Option.fromNullishOr(sessions.get(hash)), (kept) =>
      Option.map(Option.fromNullishOr(findIdentity(kept.identity)), (identity) => ({ identity, kept })),
    );
  }
  return ({ hash, now }) =>
    Option.match(found(hash), {
      onNone: () => ({ status: "unknown" }),
      onSome: (each) => renewKept(sessions, each, now),
    });
}

interface IssueRecorded {
  readonly lineage: MemoryLineage;
  readonly sessions: Sessions;
  readonly request: IssueAgentSession;
  readonly publicId: PublicId;
}

function issueRecorded({ lineage, publicId, request, sessions }: IssueRecorded): IssueAgentSessionResult {
  const issued = issue(sessions, request);
  if (issued.status === "issued") {
    const { hash, host, identity, issuedAt } = request.session;
    lineage.record({
      hash,
      identity,
      kind: "agent session",
      madeAt: issuedAt,
      parent: request.parent,
      publicId,
      where: host,
    });
  }
  return issued;
}

function memoryAgentSessions({ findIdentity, state }: MemoryAgentSessionsOptions): MemoryAgentSessions {
  const sessions: Sessions = new Map();
  state.lineage.addEnder(enderOf(sessions));
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  const used = usedIn(sessions, findIdentity);
  return {
    dropAgentSessionsOf: (identity) =>
      Effect.sync(() => {
        for (const kept of allOf(sessions, identity)) {
          sessions.delete(kept.hash);
        }
      }),
    findLiveAgentSession: ({ identity, now }) =>
      open(() => Option.map(Arr.head(liveOf(sessions, identity, now)), listed)),
    issueAgentSession: (request) =>
      Effect.flatMap(newPublicId, (publicId) =>
        open(() => issueRecorded({ lineage: state.lineage, publicId, request, sessions })),
      ),
    revokeAgentSession: (hash, now) =>
      open(() => {
        for (const kept of Option.toArray(Option.fromNullishOr(sessions.get(hash)))) {
          revoke(sessions, kept);
        }
        state.lineage.markEnded({ hash, now, why: "logged out" });
      }),
    revokeAgentSessionsOf: (identity) =>
      Effect.sync(() => {
        for (const kept of allOf(sessions, identity)) {
          revoke(sessions, kept);
        }
      }),
    revokeLiveAgentSession: (at) => open(() => revokeLive({ at, lineage: state.lineage, sessions })),
    useAgentSession: (request) => open(() => used(request)),
  };
}

export { memoryAgentSessions };

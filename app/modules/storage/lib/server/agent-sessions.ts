import { DateTime, Option } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Effect } from "effect";
import type { EndedCredential } from "./credential-lineage.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredAgentSession {
  readonly hash: TokenHash;
  readonly identity: IdentityName;
  readonly issuedAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly idleSeconds: number;
  readonly host?: string;
  readonly sessionUrl?: string;
}

interface LiveAgentSession {
  readonly issuedAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly lastUsedAt?: IsoTime;
  readonly host?: string;
  readonly sessionUrl?: string;
}

interface AgentAt {
  readonly identity: IdentityName;
  readonly now: IsoTime;
}

interface IssueAgentSession {
  readonly session: StoredAgentSession;
  readonly force: boolean;
  readonly parent?: TokenHash | undefined;
}

type IssueAgentSessionResult = { readonly status: "issued" } | { readonly status: "live"; readonly expiresAt: IsoTime };

interface UseAgentSession {
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

type UseAgentSessionResult =
  | { readonly status: "active"; readonly identity: Identity; readonly expiresAt: IsoTime }
  | { readonly status: "revoked" }
  | { readonly status: "deactivated" }
  | { readonly status: "expired" }
  | { readonly status: "unknown" };

interface AgentSessionsSection {
  readonly issueAgentSession: (request: IssueAgentSession) => Fails<IssueAgentSessionResult>;
  readonly useAgentSession: (request: UseAgentSession) => Fails<UseAgentSessionResult>;
  readonly revokeAgentSession: (hash: TokenHash, now: IsoTime) => Fails<void>;
  readonly findLiveAgentSession: (at: AgentAt) => Fails<Option.Option<LiveAgentSession>>;
  readonly revokeLiveAgentSession: (at: AgentAt) => Fails<readonly EndedCredential[]>;
}

interface Session {
  readonly expiresAt: IsoTime;
  readonly revoked: boolean;
}

function isLive(now: IsoTime): (session: Session) => boolean {
  return (session) => !session.revoked && now < session.expiresAt;
}

interface Renewal {
  readonly now: IsoTime;
  readonly idleSeconds: number;
}

interface ListedFields {
  readonly issuedAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly lastUsedAt: Option.Option<IsoTime>;
  readonly host: Option.Option<string>;
  readonly sessionUrl: Option.Option<string>;
}

function listedSession({ expiresAt, host, issuedAt, lastUsedAt, sessionUrl }: ListedFields): LiveAgentSession {
  const times = { expiresAt, issuedAt };
  const used = Option.match(lastUsedAt, { onNone: () => times, onSome: (at) => ({ ...times, lastUsedAt: at }) });
  const from = Option.match(host, { onNone: () => used, onSome: (joinedFrom) => ({ ...used, host: joinedFrom }) });
  return Option.match(sessionUrl, { onNone: () => from, onSome: (url) => ({ ...from, sessionUrl: url }) });
}

function renewedExpiry({ idleSeconds, now }: Renewal): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(now), { seconds: idleSeconds }));
}

export {
  type AgentAt,
  type AgentSessionsSection,
  type LiveAgentSession,
  type IssueAgentSession,
  type IssueAgentSessionResult,
  type StoredAgentSession,
  type UseAgentSession,
  type UseAgentSessionResult,
  isLive,
  listedSession,
  renewedExpiry,
};

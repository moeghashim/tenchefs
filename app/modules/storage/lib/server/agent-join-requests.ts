import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { IssueAgentSession, IssueAgentSessionResult } from "./agent-sessions.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { Predicate } from "effect";
import type { RequestOrigin } from "./request-origins.ts";
import { renewedExpiry } from "./agent-sessions.ts";

interface NewAgentJoinRequest extends RequestOrigin {
  readonly requestHash: TokenHash;
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
  readonly sessionUrl?: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface AgentJoinRequest extends RequestOrigin {
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

interface PendingAgentJoinRequest {
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface AgentJoinApproval {
  readonly identity: IdentityName;
  readonly created: boolean;
  readonly idleSeconds: number;
  readonly force: boolean;
  readonly parent?: TokenHash | undefined;
}

interface CollectAgentJoinRequest {
  readonly requestHash: TokenHash;
  readonly sessionHash: TokenHash;
  readonly now: IsoTime;
}

type AgentJoinCollection =
  | { readonly status: "pending" }
  | { readonly status: "gone" }
  | { readonly status: "denied" }
  | { readonly status: "live"; readonly identity: IdentityName; readonly expiresAt: IsoTime }
  | {
      readonly status: "collected";
      readonly identity: IdentityName;
      readonly created: boolean;
      readonly issuedAt: IsoTime;
      readonly expiresAt: IsoTime;
      readonly sessionUrl?: string;
    };

interface AgentJoinRequestsSection {
  readonly addAgentJoinRequest: (request: NewAgentJoinRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findAgentJoinRequest: (userCode: string, now: IsoTime) => Fails<AgentJoinRequest | undefined>;
  readonly listPendingAgentJoinRequests: (now: IsoTime) => Fails<readonly PendingAgentJoinRequest[]>;
  readonly approveAgentJoinRequest: (
    userCode: string,
    approval: AgentJoinApproval,
    now: IsoTime,
  ) => Fails<"approved" | "not_found">;
  readonly collectAgentJoinRequest: (collect: CollectAgentJoinRequest) => Fails<AgentJoinCollection>;
  readonly denyAgentJoinRequest: (userCode: string, now: IsoTime) => Fails<"denied" | "not_found">;
}

interface Approved {
  readonly approval: AgentJoinApproval;
  readonly host: string;
  readonly sessionUrl: string | null;
  readonly collect: CollectAgentJoinRequest;
}

interface Issued {
  readonly issue: IssueAgentSession;
  readonly created: boolean;
  readonly result: IssueAgentSessionResult;
}

const PENDING: AgentJoinCollection = { status: "pending" };
const GONE: AgentJoinCollection = { status: "gone" };
const DENIED: AgentJoinCollection = { status: "denied" };

function sessionUrlOf(sessionUrl: string | null): { readonly sessionUrl?: string } {
  if (Predicate.isNull(sessionUrl)) {
    return {};
  }
  return { sessionUrl };
}

function parentOf(parent: TokenHash | undefined): { readonly parent?: TokenHash } {
  if (Predicate.isUndefined(parent)) {
    return {};
  }
  return { parent };
}

function sessionToIssue({ approval, collect, host, sessionUrl }: Approved): IssueAgentSession {
  const { force, idleSeconds, identity, parent } = approval;
  const { now, sessionHash } = collect;
  const expiresAt = renewedExpiry({ idleSeconds, now });
  const session = { expiresAt, hash: sessionHash, host, identity, idleSeconds, issuedAt: now };
  return { force, session: { ...session, ...sessionUrlOf(sessionUrl) }, ...parentOf(parent) };
}

function collectionOf({ created, issue, result }: Issued): AgentJoinCollection {
  const { expiresAt, identity, issuedAt, sessionUrl } = issue.session;
  if (result.status === "live") {
    return { expiresAt: result.expiresAt, identity, status: "live" };
  }
  const collected = { created, expiresAt, identity, issuedAt, status: "collected" } as const;
  if (Predicate.isUndefined(sessionUrl)) {
    return collected;
  }
  return { ...collected, sessionUrl };
}

export { DENIED, GONE, PENDING, collectionOf, sessionToIssue };
export { originColumns, originOf } from "./request-origins.ts";

export type { JoinCodesSection } from "./join-codes.ts";

export type {
  AgentJoinApproval,
  AgentJoinCollection,
  AgentJoinRequest,
  AgentJoinRequestsSection,
  CollectAgentJoinRequest,
  NewAgentJoinRequest,
  PendingAgentJoinRequest,
};

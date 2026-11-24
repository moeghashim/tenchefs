/**
 * Agent sessions on the wire, shared by the server, the SDK and the CLI: the route `join` and `leave` use, their
 * requests and answers, the idle expiry's format, and the codes they refuse with. `join` issues an agent session
 * token, a bearer token that acts as the agent for one session (Matt, 2026-11-23, mattpocock/cookout#114).
 */
import type { AgentIdentity, IdentityName, Token } from "../identities/index.ts";
import type { IsoTime } from "../time/index.ts";

/** `POST /v1/agent-session` joins (issues an agent session token); `DELETE /v1/agent-session` leaves (revokes it). */
export const agentSessionPath = "/v1/agent-session";

/**
 * `GET /v1/identities/:name/agent-session` lists the agent's live agent session token (`ListAgentSessionsResponse`),
 * and `DELETE` revokes it (`RevokeAgentSessionResponse`): its session's next request is 401 `agent_session_revoked`.
 * Only the agent's owner or an admin may; anyone else is 403 `not_owner` (Matt, 2026-11-23, mattpocock/cookout#118).
 */
export const identityAgentSessionPath = "/v1/identities/:name/agent-session";

/** How long an agent session token lives unused when `join` doesn't ask: 7 days. */
export const defaultIdleExpiry = "7d";

/**
 * The format of an idle expiry: a whole number of seconds, minutes, hours or days, such as `30d` or `12h`. An
 * agent session token expires once it goes this long unused.
 */
export const idleExpiryPattern = /^[1-9]\d{0,6}[smhd]$/u;

/**
 * The body of `POST /v1/agent-session`. Sent with an agent's token, `as` must be that agent: a check, not a switch.
 * Sent with a human's token, `as` names an agent the human owns, or creates one (Matt, 2026-11-23,
 * mattpocock/cookout#119): an agent the caller owns by that name is joined; else a free name is created, owned by
 * the caller; else, when someone else has the name, `<caller>/<name>` is joined, or created. A human's name, or
 * `<other>/<name>`, is refused. This is the one route a human's token may use from a harness.
 */
export interface JoinRequest {
  readonly as: string;
  /** Joins even while the agent has a live agent session token, which is revoked at once. */
  readonly force?: boolean;
  /** How long the token may go unused before it expires, such as `30d`. Default `7d`; at most `COOKOUT_MAX_IDLE_EXPIRY`. */
  readonly idleExpiry?: string;
  /** The host the agent joins from, such as the machine's hostname, shown to its owner. 1–253 characters. */
  readonly host?: string;
  /**
   * The display name for the agent this join creates: 1-80 characters after trimming. Sent for an agent that
   * already exists, it is 400 `display_name_on_existing_agent` and nothing is joined.
   */
  readonly displayName?: string;
  /**
   * Refuses to create an agent without `displayName`: 400 `display_name_required`, and nothing is created. The CLI
   * sends it (mattpocock/cookout#313); the server refuses every such create one release later.
   */
  readonly requireDisplayName?: boolean;
}

/** The answer to `join`. */
export interface AgentSessionResponse {
  /** Send it as the bearer token to act as the agent for this session. Shown this once. */
  readonly agentSessionToken: Token;
  readonly issuedAt: IsoTime;
  /** Each request sent with the token moves it forward by the idle expiry. */
  readonly expiresAt: IsoTime;
  /** The agent joined, such as `ada/triage-agent` when a human's `as: "triage-agent"` was someone else's. */
  readonly identity: IdentityName;
  /** Whether this join created the agent, owned by the human who joined. */
  readonly created: boolean;
}

/** An agent's live agent session token as its owner sees it: when it was issued and last used, never the token. */
export interface ListedAgentSession {
  readonly issuedAt: IsoTime;
  /** Left out until a request is sent with the token. */
  readonly lastUsedAt?: IsoTime;
  readonly expiresAt: IsoTime;
  /** The host it joined from, if the joining client said. */
  readonly host?: string;
}

/** The answer to listing an agent's agent session tokens: its live one, or none. */
export interface ListAgentSessionsResponse {
  readonly agentSessions: readonly ListedAgentSession[];
}

/** The answer to revoking an agent's agent session token: `false` when it had no live one. */
export interface RevokeAgentSessionResponse {
  readonly revoked: boolean;
}

/** The answer to `leave`. */
export interface LeaveResponse {
  readonly revoked: true;
}

/** The `details` of the 409 `agent_session_live` refusal: when the agent's live agent session token expires if unused. */
export interface AgentSessionLiveDetails {
  readonly expiresAt: IsoTime;
}

/** The `details` of the 400 `idle_expiry_too_long` refusal: the longest idle expiry this cookout allows. */
export interface IdleExpiryTooLongDetails {
  readonly maxIdleExpiry: string;
}

/**
 * The 401 code for an agent session token that was revoked: by `leave`, another session's `join --force`, or its
 * agent's owner or an admin.
 */
export const agentSessionRevoked = "agent_session_revoked";

/** The 401 code for an agent session token that went unused past its expiry. */
export const agentSessionExpired = "agent_session_expired";

/**
 * The codes join and leave refuse with: the 403s `not_your_identity` (an agent joins as another identity),
 * `identity_kind` (join as a human: only agents join) and `not_owner` (a human joins `<other>/<name>`; listed with
 * the identity codes), the 409s
 * `agent_session_live` (join while the agent has a live agent session token) and `identity_deactivated` (join a
 * Deactivated agent), the 400s `idle_expiry_too_long`, `agent_session_required` (leave sent without an agent session token),
 * `display_name_required` (a join that would create an agent with no display name, when the request asks for one) and
 * `display_name_on_existing_agent` (a display name sent to join an agent that already exists),
 * the 403 `not_brought_in` (an agent approves a join for an existing agent it didn't bring in, #370), the 404
 * `agent_join_request_not_found` (an agent join request expired, was collected, or never existed), and the
 * 401s any request sent with an ended agent session token gets, and the 404 `join_code_not_found` (a join code that
 * was used, expired or never issued).
 */
export const agentSessionErrorCodes = [
  "not_your_identity",
  "identity_kind",
  "agent_session_live",
  "identity_deactivated",
  "idle_expiry_too_long",
  "agent_session_required",
  "display_name_required",
  "display_name_on_existing_agent",
  "agent_join_request_not_found",
  "join_code_not_found",
  "not_brought_in",
  agentSessionRevoked,
  agentSessionExpired,
] as const;

/**
 * `POST /v1/agent-join-requests` (no token): a box with no Login asks to join as an agent (Matt, 2026-11-23,
 * mattpocock/cookout#120). The server answers a user code and a secret request ID, valid 10 minutes unapproved.
 */
export const agentJoinRequestsPath = "/v1/agent-join-requests";

/** `POST /v1/agent-join-requests/collect` (no token): 202 pending, then the agent session token once; 404 after. */
export const collectAgentJoinRequestPath = "/v1/agent-join-requests/collect";

/**
 * `GET /v1/agent-join-requests/:code` (a human, or an agent for its owner, #370): the live request with that user code,
 * as it would join for the caller.
 */
export const agentJoinRequestPath = "/v1/agent-join-requests/:code";

/**
 * `PUT /v1/agent-join-requests/:code/approval`: approves it as the caller. A human approves as before; an agent approves
 * only a join that creates an agent of its own owner, recorded as brought in by it, or rejoins one it brought in (#370).
 */
export const agentJoinRequestApprovalPath = "/v1/agent-join-requests/:code/approval";

/**
 * The approval page's path on the server for an agent join request's user code.
 * @param userCode The request's user code.
 * @returns The path, such as `/#/approve-join/WDJB-MJHT`.
 */
export function agentJoinApprovalPathOf(userCode: string): string {
  return `/#/approve-join/${userCode}`;
}

/** The body of `POST /v1/agent-join-requests`: the agent to join as, the box's host and the idle expiry it asks for. */
export interface StartAgentJoinRequest {
  /** A name as `join` takes it: the approver's own agent, a free name, or else `<approver>/<name>`. */
  readonly as: string;
  /** The box's host name, shown on the approval page. 1–253 characters. */
  readonly host: string;
  /** The longest idle expiry the box asks for, such as `30d`; the approver may lower it. Default `7d`. */
  readonly idleExpiry?: string;
}

/** A started agent join request. Only `requestId` collects the agent session token, and it is shown this once. */
export interface AgentJoinRequestStartedResponse {
  readonly userCode: string;
  readonly requestId: Token;
  readonly expiresAt: IsoTime;
  readonly approvalPath: string;
}

/** Pending until a human approves, then the agent session token, once. Never a human's credential. */
export type AgentJoinCollectedResponse =
  | { readonly status: "pending" }
  | { readonly status: "approved"; readonly agentSession: AgentSessionResponse };

/** An agent join request as the human viewing it would approve it. */
export interface AgentJoinRequestView {
  readonly userCode: string;
  readonly host: string;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
  /** The name the box asked to join as. */
  readonly as: string;
  /** The agent approving joins, such as `ada/triage-agent` when `triage-agent` is someone else's. */
  readonly joins: IdentityName;
  /** Whether approving creates that agent, owned by the approver. */
  readonly creates: boolean;
  /** The idle expiry the box asked for (or the default); the approver may lower it, never raise it. */
  readonly idleExpiry: string;
  /** When the agent's live agent session token expires, if it has one: approving replaces it only with `force`. */
  readonly liveSessionExpiresAt?: IsoTime;
}

/** The answer to showing or approving an agent join request. */
export interface AgentJoinRequestResponse {
  readonly agentJoinRequest: AgentJoinRequestView;
}

/** The body of approving an agent join request. */
export interface ApproveAgentJoinRequest {
  /** A shorter idle expiry than the box asked for; longer is 400 `idle_expiry_too_long`. */
  readonly idleExpiry?: string;
  /** Replaces the agent's live agent session token, as `join --force`; without it, 409 `agent_session_live`. */
  readonly force?: boolean;
}

/** The SDK's calls for an agent join request: a box with no Login joins once a person approves in the browser. */
export interface AgentJoinCalls {
  /** `POST /v1/agent-join-requests` (no token): starts an agent join request, which lasts 10 minutes unapproved. */
  readonly startAgentJoin: (request: StartAgentJoinRequest) => Promise<AgentJoinRequestStartedResponse>;
  /**
   * `POST /v1/agent-join-requests/collect` (no token): `pending` until a human approves, then, once, the agent
   * session token. A wrong, expired or collected request ID is 404 `agent_join_request_not_found`.
   */
  readonly collectAgentJoin: (requestId: Token) => Promise<AgentJoinCollectedResponse>;
  /** `GET /v1/agent-join-requests/:code` (a human): the request, and the agent approving it would join. */
  readonly getAgentJoinRequest: (userCode: string) => Promise<AgentJoinRequestResponse>;
  /** `PUT /v1/agent-join-requests/:code/approval` (a human): joins the agent as `join` with the caller's Login would. */
  readonly approveAgentJoin: (
    userCode: string,
    approval?: ApproveAgentJoinRequest,
  ) => Promise<AgentJoinRequestResponse>;
}

/** How long a join code lasts unredeemed: 15 minutes. */
export const joinCodeLifetimeMinutes = 15;

/**
 * `POST /v1/join-codes` (a human; an agent is 403 `human_only`): creates an agent the caller owns, with a
 * single-use join code bound to it (mattpocock/cookout#231).
 */
export const joinCodesPath = "/v1/join-codes";

/** `POST /v1/join-codes/redeem` (no token): redeems a join code, once, for its agent's agent session token. */
export const redeemJoinCodePath = "/v1/join-codes/redeem";

/** The body of `POST /v1/join-codes`: the new agent, named as `POST /v1/identities` names one, and its description. */
export interface CreateJoinCodeRequest {
  readonly name: string;
  /** What the agent is for, trimmed, then 1–500 characters. */
  readonly description?: string;
}

/**
 * The answer to `POST /v1/join-codes`: the new agent, and its join code, shown this once. The code can only ever join
 * that one agent, once, before `expiresAt`; it is never a person's credential.
 */
export interface JoinCodeResponse {
  readonly identity: AgentIdentity;
  readonly joinCode: Token;
  readonly expiresAt: IsoTime;
}

/** The body of `POST /v1/join-codes/redeem`. */
export interface RedeemJoinCodeRequest {
  readonly joinCode: string;
  /** How long the agent session token may go unused, such as `30d`, as `join` takes it. */
  readonly idleExpiry?: string;
  /** The host the agent joins from, shown to its owner. 1–253 characters. */
  readonly host?: string;
}

/** The SDK's calls for join codes. */
export interface JoinCodeCalls {
  /** `POST /v1/join-codes` (a human): creates an agent the caller owns, with a join code for it, valid 15 minutes. */
  readonly createJoinCode: (request: CreateJoinCodeRequest) => Promise<JoinCodeResponse>;
  /**
   * `POST /v1/join-codes/redeem` (no token): the agent session token of the code's agent. A used, expired or unknown
   * code is 404 `join_code_not_found`.
   */
  readonly redeemJoinCode: (request: RedeemJoinCodeRequest) => Promise<AgentSessionResponse>;
}

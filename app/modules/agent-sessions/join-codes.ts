/** Join codes on the wire: the routes that create and redeem one, their requests and answers, and the SDK's calls. */
import type { AgentIdentity, Token } from "../identities/index.ts";
import type { AgentSessionResponse } from "./index.ts";
import type { IsoTime } from "../time/index.ts";

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
  /** Trimmed, then 1–80 characters. Left out, it is 400 `display_name_required` and nothing is created. */
  readonly displayName?: string;
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
  /** The session URL of the session it issues, as `join` takes it (mattpocock/cookout#506). */
  readonly sessionUrl?: string;
}

/** The answer to `POST /v1/join-codes/redeem`: the code's agent's agent session, as `join` answers it. */
export type RedeemJoinCodeResponse = AgentSessionResponse;

/** The SDK's calls for join codes. */
export interface JoinCodeCalls {
  /** `POST /v1/join-codes` (a human): creates an agent the caller owns, with a join code for it, valid 15 minutes. */
  readonly createJoinCode: (request: CreateJoinCodeRequest) => Promise<JoinCodeResponse>;
  /**
   * `POST /v1/join-codes/redeem` (no token): the agent session token of the code's agent. A used, expired or unknown
   * code is 404 `join_code_not_found`.
   */
  readonly redeemJoinCode: (request: RedeemJoinCodeRequest) => Promise<RedeemJoinCodeResponse>;
}

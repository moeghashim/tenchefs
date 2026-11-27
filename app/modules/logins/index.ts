/**
 * Logging a machine in by browser approval, on the wire (ADR 0047), shared by the server, the SDK, the CLI and the
 * web: the routes, their bodies and answers, the user code's rule, the approval page's path and the SDK's calls.
 * `cookout login` starts a login request, a human approves it in the web UI by typing its user code, and the CLI collects
 * the Login's own credential with the secret request ID.
 */
import type { Identity, IdentityResponse, LoginLinkResponse, Token } from "../identities/index.ts";
import type { IsoTime } from "../time/index.ts";

interface StartLoginRequest {
  readonly host: string;
}

declare const brand: unique symbol;

const publicIdPattern = /^[0-9a-f]{16}$/u;

interface SessionMadeByView {
  readonly kind: "web" | "cli" | "identity token";
  readonly where?: string;
}

/** One of a person's live sessions, as `GET /v1/sessions` lists it. */
export interface SessionView {
  readonly id: PublicId;
  readonly kind: "web" | "cli";
  readonly where: string;
  readonly madeAt: IsoTime;
  readonly lastUsedAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly current: boolean;
  readonly madeBy?: SessionMadeByView;
}

/** What started a request a person approves by its code: a browser or a terminal logging in, or an agent joining. */
export type ApprovalRequestKind = "browser" | "terminal" | "agent_join";

/**
 * What a person sees about a Login request or agent join request before Approve (#905), recorded when it started, so
 * they approve only the device they meant to.
 */
export interface ApprovalRequestDetails {
  readonly kind: ApprovalRequestKind;
  /** A browser's browser and OS, such as `Firefox on macOS`, or else the host the request named. */
  readonly where: string;
  /** The client's IP address when it started (`Fly-Client-IP` on Fly); missing on a request stored before #905. */
  readonly clientIp?: string;
  /** When it started, for its age. */
  readonly createdAt: IsoTime;
}

/** A Login request as the person approving it sees it. */
export interface LoginRequestView extends ApprovalRequestDetails {
  readonly userCode: string;
  readonly host: string;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

/** A credential's public ID (ADR 0153): 16 random hex digits, not secret, unrelated to its hash. It never authenticates. */
export type PublicId = string & { readonly [brand]: "PublicId" };

/**
 * Whether `value` follows the public ID rule.
 * @param value The text to check.
 * @returns Whether it is a public ID.
 */
export function isPublicId(value: string): value is PublicId {
  return publicIdPattern.test(value);
}

/** A login request's user code, which a person types into the approval page from the terminal: `WDJB-MJHT`. */
export const userCodePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/u;

/** How long a login request lasts before it is gone, approved or not. */
export const loginRequestSeconds = 600;

/**
 * How long a Login credential lasts unused: 90 days (Matt, 2026-11-27, board thread 7142, msg 7159). Each use moves
 * its expiry on to 90 days after it; an Identity token never expires.
 */
export const loginCredentialIdleSeconds = 7_776_000;

/** The refusal code for a Login credential that ended after 90 days unused (proposed, awaiting Matt). */
export const loginExpired = "login_expired";

/** The longest machine name a login request may give. */
export const hostMaximumLength = 100;

/**
 * Whether `value` follows the user code rule.
 * @param value The text to check.
 * @returns Whether it is a user code.
 */
export function isUserCode(value: string): boolean {
  return userCodePattern.test(value);
}

/** A started login request. Only `requestId` collects the Login, and it is shown this once. */
export interface LoginRequestStartedResponse {
  readonly userCode: string;
  readonly requestId: Token;
  readonly expiresAt: IsoTime;
  readonly approvalPath: string;
}

/**
 * A web login request's collect answer (#909): pending until a human approves, then, once, that human, with the new
 * session set as the session cookie. The body never holds the session's secret.
 */
export type WebLoginCollectedResponse =
  | { readonly status: "pending" }
  | { readonly status: "approved"; readonly identity: Identity };

/** Pending until a human approves, then that human and a new Login credential for this machine, once. */
export type LoginCollectedResponse =
  | { readonly status: "pending" }
  | { readonly status: "approved"; readonly identity: Identity; readonly token: Token };

/** The answer to showing or approving a login request. */
export interface LoginRequestResponse {
  readonly loginRequest: LoginRequestView;
}

/** The answer to `DELETE /v1/login`: whether the token sent was a Login credential, now revoked. */
export interface LogoutResponse {
  readonly revoked: boolean;
}

/** `POST /v1/login-requests` (no token): starts a login request (ADR 0047). */
export const loginRequestsPath = "/v1/login-requests";

/** `POST /v1/login-requests/collect` (no token): 202 pending, then 200 once approved; 404 `login_request_not_found` after. */
export const collectLoginRequestPath = "/v1/login-requests/collect";

/** `GET /v1/login-requests/:code` (a human): the live request with that user code. */
export const loginRequestPath = "/v1/login-requests/:code";

/** `PUT /v1/login-requests/:code/approval` (a human; an agent is 403 `human_only`): approves it as the caller. */
export const loginRequestApprovalPath = "/v1/login-requests/:code/approval";

/** `DELETE /v1/login`: revokes the Login credential the request was sent with. */
export const loginPath = "/v1/login";

/**
 * The approval page's path on the server, for Login requests and agent join requests alike. It never holds a code:
 * the person types the code into the page on a device already logged in (#905).
 */
export const approvalPath = "/#/approve";

/**
 * `GET /v1/sessions` (a human; an agent is 403 `human_only`): the caller's live sessions (ADR 0153).
 */
export const sessionsPath = "/v1/sessions";

/**
 * `DELETE /v1/sessions/:id` (a human): revokes one of the caller's live sessions by its public ID, with everything
 * below it. Another person's ID or an unknown one is 404 `session_not_found`.
 */
export const sessionByIdPath = "/v1/sessions/:id";

/** How long a login link lasts before it is gone, used or not: 15 minutes (#912). */
export const loginLinkSeconds = 900;

/**
 * `POST /v1/identities/:name/login-link` (an admin; 403 `admin_only` otherwise): a one-time login link for the person
 * named, answered once. An agent is 403 `human_only`; an unknown name is 404 `identity_not_found`.
 */
export const loginLinkPath = "/v1/identities/:name/login-link";

/**
 * `POST /v1/login-links/redeem` (no token): redeems a login link's secret, setting the session cookie and answering its
 * person. A used, expired or unknown link is 404 `login_link_not_found`.
 */
export const redeemLoginLinkPath = "/v1/login-links/redeem";

/** The web UI's path a login link opens, before its secret: `<board>/#/login-link/<secret>`. */
export const loginLinkWebPath = "/#/login-link/";

/** The refusal code for a login link that was used, expired or never made. */
export const loginLinkNotFound = "login_link_not_found";

/**
 * `GET /v1/sessions/log-out-everywhere` (a human) previews, and `POST` does, Log out everywhere: every credential in
 * the caller's lineage ends except the session the request was sent with and what it made, which becomes a root.
 */
export const logOutEverywherePath = "/v1/sessions/log-out-everywhere";

/** The live credentials Log out everywhere ends, counted by kind. */
export interface LogOutEverywhereCounts {
  readonly sessions: number;
  readonly agentSessions: number;
  readonly joinCodes: number;
}

/** The answer to `GET /v1/sessions/log-out-everywhere`: what Log out everywhere would end now. */
export interface LogOutEverywherePreview {
  readonly willEnd: LogOutEverywhereCounts;
}

/** The answer to `POST /v1/sessions/log-out-everywhere`: what it ended. */
export interface LogOutEverywhereResponse {
  readonly ended: LogOutEverywhereCounts;
}

/** The answer to `GET /v1/sessions`, oldest first. */
export interface ListSessionsResponse {
  readonly sessions: readonly SessionView[];
}

/** The answer to `DELETE /v1/sessions/:id`: how many live credentials it ended, the session and those below it. */
export interface RevokeSessionResponse {
  readonly ended: number;
}

/** The SDK's calls for logging a machine in by browser approval. */
export interface LoginCalls {
  /**
   * `POST /v1/login-requests` (no token): starts a login request, which lasts 10 minutes. The person types
   * `userCode` into the approval page at `approvalPath`; only `requestId`, shown this once, collects the Login.
   */
  readonly startLogin: (request: StartLoginRequest) => Promise<LoginRequestStartedResponse>;
  /**
   * `POST /v1/login-requests/collect` (no token): `pending` until a human approves, then, once, that human and a new
   * Login credential for this machine. A wrong, expired or collected request ID is 404 `login_request_not_found`.
   */
  readonly collectLogin: (requestId: Token) => Promise<LoginCollectedResponse>;
  /**
   * `POST /v1/login-requests` with `{ kind: "web" }` (no token): starts a browser's login request (#909), recording
   * the browser and OS its User-Agent names. It is approved as any other, and collects only with `collectWebLogin`.
   */
  readonly startWebLogin: () => Promise<LoginRequestStartedResponse>;
  /**
   * `POST /v1/login-requests/collect` with `{ kind: "web" }` (no token): `pending` until a human approves, then, once,
   * that human, setting the session cookie. A CLI request, or a wrong, expired or collected request ID, is 404
   * `login_request_not_found`, as a web request is to `collectLogin`.
   */
  readonly collectWebLogin: (requestId: Token) => Promise<WebLoginCollectedResponse>;
  /** `GET /v1/login-requests/:code` (a human): the live login request with that user code, for its approval page. */
  readonly getLoginRequest: (userCode: string) => Promise<LoginRequestResponse>;
  /** `PUT /v1/login-requests/:code/approval` (a human; an agent is 403 `human_only`): approves it as the caller. */
  readonly approveLogin: (userCode: string) => Promise<LoginRequestResponse>;
  /** `DELETE /v1/login`: revokes the Login credential this client sends, answering whether it was one. */
  readonly revokeLogin: () => Promise<LogoutResponse>;
  /** `GET /v1/sessions` (a human; an agent is 403 `human_only`): the caller's live sessions, oldest first. */
  readonly listSessions: () => Promise<ListSessionsResponse>;
  /**
   * `DELETE /v1/sessions/:id` (a human): revokes the caller's session with that public ID and everything below it,
   * whose open event streams close. Another person's ID or an unknown one is 404 `session_not_found`.
   */
  readonly revokeSession: (id: PublicId) => Promise<RevokeSessionResponse>;
  /**
   * `POST /v1/identities/:name/login-link` (an admin): a login link for the person named, which logs them in once,
   * within 15 minutes. An agent is 403 `human_only`.
   */
  readonly createLoginLink: (name: string) => Promise<LoginLinkResponse>;
  /**
   * `POST /v1/login-links/redeem` (no token): redeems a login link's secret into a web session for its person, set as
   * the session cookie. A used, expired or unknown link is 404 `login_link_not_found`.
   */
  readonly redeemLoginLink: (secret: Token) => Promise<IdentityResponse>;
  /** `GET /v1/sessions/log-out-everywhere` (a human): what Log out everywhere would end, by kind, ending nothing. */
  readonly previewLogOutEverywhere: () => Promise<LogOutEverywherePreview>;
  /**
   * `POST /v1/sessions/log-out-everywhere` (a human): ends every credential in the caller's lineage except this
   * client's session and what it made, whose open event streams close, and answers what ended by kind.
   */
  readonly logOutEverywhere: () => Promise<LogOutEverywhereResponse>;
}

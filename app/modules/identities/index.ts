/**
 * Identities on the wire, shared by the server, the SDK and the web: the `IdentityName`, `Owner`, `Token` and
 * `TokenHash` brands, the two identity kinds and their constructors, the identity as the server shows it (its avatar
 * too), the routes, and the error codes bearer auth, the admin check and identity creation answer with.
 */
import type { Described } from "./client.ts";
import type { IsoTime } from "../time/index.ts";
import type { WithAvatar } from "../avatars/index.ts";
import { avatarErrorCodes } from "../avatars/index.ts";
import { identityDeletionErrorCodes } from "./lib/deletion.ts";

declare const brand: unique symbol;

type Brand<Name extends string> = string & { readonly [brand]: Name };

type IdentityFields = WithAvatar<{
  readonly name: IdentityName;
  readonly displayName?: DisplayName;
  readonly admin: boolean;
  readonly createdAt: IsoTime;
  readonly deactivated?: true;
}>;

/**
 * An identity's name: 1–64 lowercase letters, digits or `-`, so `@name` mentions parse cleanly, or two such parts
 * joined by one `/`, such as `matt/triage-agent`. The first part of a namespaced name is the name of the human who
 * owns the agent. Unique on a server.
 */
export type IdentityName = Brand<"IdentityName">;

/** The name of the human who owns an agent, such as `matt`. A human's name never contains `/`. */
export type Owner = IdentityName;

/** The secret an identity sends as `Authorization: Bearer <token>`. */
export type Token = Brand<"Token">;

/** What the store keeps instead of a token. */
export type TokenHash = Brand<"TokenHash">;

const as = <B extends Brand<string>>(value: string): B => value as B;

/**
 * An identity's display name, such as `Ada Lovelace`, shown beside its `@name`: 1–80 characters with no space at
 * either end. Not unique, and never what mentions use.
 */
export type DisplayName = Brand<"DisplayName">;

/** The rule a name without a `/` follows: a human's name, an owner, a command's name, or a part of a namespaced name. */
export const plainNamePattern = /^[a-z0-9-]{1,64}$/u;

/** The rule every identity name follows, for the backend's Schemas: a plain name, or `<owner>/<name>`. */
export const identityNamePattern = /^[a-z0-9-]{1,64}(?:\/[a-z0-9-]{1,64})?$/u;

/** The display-name rule, in UTF-16 code units as `String.length` counts them, after trimming. */
export const displayNameLength = { maximum: 80, minimum: 1 } as const;

/**
 * Whether `value` is trimmed and the length of a display name.
 *
 * @param value The text to check.
 * @returns Whether it is a `DisplayName`.
 */
export function isDisplayName(value: string): value is DisplayName {
  return (
    value === value.trim() && value.length >= displayNameLength.minimum && value.length <= displayNameLength.maximum
  );
}

/** Whether `value` follows the identity-name rule; if so, it is an `IdentityName`. */
export function isIdentityName(value: string): value is IdentityName {
  return identityNamePattern.test(value);
}

/** Whether `value` is a plain name, without a `/`, as an owner's is; if so, it is an `Owner`. */
export function isOwner(value: string): value is Owner {
  return plainNamePattern.test(value);
}

/** Marks a string as a token. Only `secrets` issues one, or `COOKOUT_ADMIN_TOKEN` sets the admin's; only bearer auth reads one from a request. */
export function token(value: string): Token {
  return as(value);
}

/** Marks a string as a token hash. Only `secrets` hashes a token, and only the store reads one back. */
export function tokenHash(value: string): TokenHash {
  return as(value);
}

/** The name of the admin identity, whose token comes from `COOKOUT_ADMIN_TOKEN` whenever that setting changes. */
export const firstAdminName: IdentityName = as("admin");

/** The two kinds of identity. Every identity is exactly one of them. */
export const identityKinds = ["human", "agent"] as const;

/** Whether an identity is a person or an agent. Set when the identity is created, and never changed. */
export type IdentityKind = (typeof identityKinds)[number];

/**
 * A person using the board as themself. A human is its own person, so it has no owner, and its name has no `/`. Any
 * human can create agents it owns; an admin can also create humans and agents owned by any human, rotate tokens and
 * deactivate identities.
 */
export type HumanIdentity = IdentityFields & {
  readonly kind: "human";
};

/** A program on the board. It always has an owner: the human who created it, or the one an admin named. */
export type AgentIdentity = Described<IdentityFields> & {
  readonly kind: "agent";
  readonly owner: Owner;
  /** The agent whose approval of a join created this agent (#370); never changed. Absent when a person approved. */
  readonly broughtInBy?: IdentityName;
  /** Present, and true, on a command's handler identity in `GET /v1/identities`. */
  readonly handler?: true;
};

/**
 * An identity as the server shows it: a human or an agent, never both. Its token is never part of it. A Deactivated
 * identity has `deactivated: true`: its history and name stay, but every token it holds fails with 401, it can't be
 * mentioned, and `GET /v1/identities` leaves it out unless asked (ADR 0045).
 */
export type Identity = HumanIdentity | AgentIdentity;

/**
 * Whether an identity's name fits its owner: a plain name always does, and `<owner>/<name>` only on an agent owned by
 * `<owner>`.
 *
 * @param identity The identity to check.
 * @returns Whether the name is allowed.
 */
export function nameFitsOwner(identity: Identity): boolean {
  const [namespace] = identity.name.split("/");
  return !identity.name.includes("/") || (identity.kind === "agent" && identity.owner === namespace);
}

/** The answer to `GET /v1/whoami`, and to the admin and display-name changes. */
export type IdentityResponse = {
  readonly identity: Identity;
};

/** The answer to creating an identity and rotating its token. The token is shown this once only. */
export type IdentityWithTokenResponse = {
  readonly identity: Identity;
  readonly token: Token;
  /** On creating a person only: a one-time login link for them, shown this once (#912). */
  readonly loginLink?: LoginLinkResponse;
};

/** A one-time login link, shown once: it logs its person in once, until `expiresAt`, 15 minutes after it was made. */
export type LoginLinkResponse = {
  readonly link: string;
  readonly expiresAt: IsoTime;
};

/** The answer to `GET /v1/identities`: every identity, sorted by name. */
export type ListIdentitiesResponse = {
  readonly identities: readonly Identity[];
};

/** The query of `GET /v1/identities`: Deactivated identities are left out unless `include` is `deactivated`. */
export interface ListIdentitiesQuery {
  readonly include?: "deactivated";
}

/** The answer to `POST /v1/identities/:name/deactivate`: the deactivated identity. */
export interface DeactivateIdentityResponse {
  readonly identity: Identity;
}

/**
 * The body of `POST /v1/identities`. Any human may create an agent it owns; only an admin may create a human, or an
 * agent owned by another human (403 `admin_only`). An agent creates only agents for its own owner, with no token.
 */
export type CreateIdentityRequest = {
  /** A plain name, or `<owner>/<name>` for an agent whose owner is `<owner>` (400 `name_not_owned` otherwise). A human's name has no `/`. */
  readonly name: string;
  readonly kind: IdentityKind;
  /** An agent's owner, an existing human (400 `owner_not_human` otherwise); left out, the caller or its owner. */
  readonly owner?: string;
  /** Trimmed, then 1–80 characters (400 otherwise). An agent's is required (400 `display_name_required`). */
  readonly displayName?: string;
  /** An agent's description: trimmed, then 1–500 characters (400 otherwise, or on a human). */
  readonly description?: string;
};

/** The body of `PUT /v1/identities/:name/display-name`: the new display name (trimmed, then 1–80 characters), or `null` to clear it. */
export interface SetDisplayNameRequest {
  readonly displayName: string | null;
}

/** `DELETE /v1/identities/:name` (admin) deletes an identity no message names; `GET …/message-count` counts them. */
export { type IdentityMessageCountResponse, identityMessageCountPath, identityPath } from "./lib/deletion.ts";

/** `GET /v1/whoami`: the identity behind the token. */
export const whoamiPath = "/v1/whoami";

/** `GET /v1/identities` (any identity) and `POST /v1/identities` (see `CreateIdentityRequest`). */
export const identitiesPath = "/v1/identities";

/**
 * `POST /v1/identities/:name/deactivate`: Deactivates the identity, answering `DeactivateIdentityResponse`. Every token
 * it holds fails at once; a human's agents stay active. An admin may deactivate anyone, and a human their
 * own agents (403 `not_owner` otherwise). The last admin is refused with 409 `last_admin`. Its messages and name stay
 * (ADR 0045); only an identity no message names can be deleted instead (`identityPath`).
 */
export const identityDeactivatePath = "/v1/identities/:name/deactivate";

/**
 * `POST /v1/identities/:name/reactivate`: undoes deactivating, answering `IdentityWithTokenResponse` with a fresh
 * token; the old tokens stay dead. An admin may reactivate anyone, and a human their own agents (403 `admin_only` or
 * `not_owner` otherwise). An identity that isn't Deactivated is 409 `not_deactivated`. An agent whose owner is
 * Deactivated can be reactivated.
 */
export const identityReactivatePath = "/v1/identities/:name/reactivate";

/**
 * `POST /v1/identities/:name/token` (the agent's owner, or an admin): issues a new token, and the old one stops
 * working at once. Anyone else is refused with 403 `not_owner`.
 */
export const identityTokenPath = "/v1/identities/:name/token";

/**
 * `PUT /v1/identities/:name/admin` (admin) makes a human an admin; `DELETE` removes admin, refusing the last admin's
 * with 409 `last_admin`. An agent can't be made an admin (403 `human_only`).
 */
export const identityAdminPath = "/v1/identities/:name/admin";

/**
 * `PUT /v1/identities/:name/owner` (admin): gives an agent to another human (`{ owner }`, a human's name), answering
 * `IdentityResponse`. A human is refused with 403 `identity_kind`, an owner who is no human with 400 `owner_not_human`,
 * and a namespaced agent (`ada/x`), which could only move with a rename, with 400 `name_not_owned`.
 */
export const identityOwnerPath = "/v1/identities/:name/owner";

/**
 * `PUT /v1/identities/:name/display-name`: sets or clears an identity's display name, answering `IdentityResponse`.
 * The identity itself, the human who owns it (an agent whose owner is that human's name) or an admin may; anyone else
 * is refused with 403 `not_owner`.
 */
export const identityDisplayNamePath = "/v1/identities/:name/display-name";

/**
 * `POST /v1/session` (a human's bearer token): logs the web UI in, answering with the identity and a cookie holding
 * a new Login credential (ADR 0103); an agent gets 403 `human_only`. `DELETE /v1/session` revokes it and clears it.
 */
export const sessionPath = "/v1/session";

/**
 * The harness running a client's process (`Harness`), such as `claude-code`: 1–40 of `a-z`, `0-9` or `-` (`isHarness`).
 * The CLI and the SDK send it in `harnessHeader` when such a tool runs the process. A human's token sent with it is
 * 403 `agent_as_human`, to catch an agent that inherited a person's token; not a security boundary (ADR 0038).
 * A message posted with it records the tool as `harness`.
 */
export type Harness = Brand<"Harness">;

export const harnessPattern = /^[a-z0-9-]{1,40}$/u;

export function isHarness(value: string): value is Harness {
  return harnessPattern.test(value);
}

export const harnessHeader = "cookout-harness";

/** The HttpOnly, SameSite=Strict cookie the web UI's requests carry instead of the bearer header. */
export const sessionCookieName = "cookout_session";

/** The rule every token the server issues follows, for the backend's Schemas. */
export const tokenPattern = /^cookout_[A-Za-z0-9_-]+$/u;

/** Whether `value` looks like a token the server issued; if so, it is a `Token`. */
export function isToken(value: string): value is Token {
  return tokenPattern.test(value);
}

/**
 * The codes bearer auth (401), the admin check (403), login (403 `human_only`) and identity admin refuse with. A
 * command token past its 24 h is 401 `token_expired`; used outside its call's thread it is 403 `outside_command_thread`.
 * A human's token sent from a harness (`cookout-harness`) is 403 `agent_as_human`.
 */
export const identityErrorCodes = [
  "token_missing",
  "token_unknown",
  "token_revoked",
  "token_expired",
  "outside_command_thread",
  "agent_as_human",
  "admin_only",
  "human_only",
  "identity_exists",
  "identity_not_found",
  "last_admin",
  "not_owner",
  "owner_not_human",
  "name_not_owned",
  "not_deactivated",
  ...identityDeletionErrorCodes,
  ...avatarErrorCodes,
  "login_request_not_found",
  "login_link_not_found",
] as const;

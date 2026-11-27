import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { DateTime } from "effect";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { RequestOrigin } from "./request-origins.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { loginCredentialIdleSeconds } from "../../../logins/index.ts";

type LoginRequestKind = "web" | "cli";

interface NewLoginRequest extends RequestOrigin {
  readonly requestHash: TokenHash;
  readonly kind?: LoginRequestKind;
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface LoginRequest extends RequestOrigin {
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

interface CollectLoginRequest {
  readonly requestHash: TokenHash;
  readonly kind?: LoginRequestKind;
  readonly credentialHash: TokenHash;
  readonly now: IsoTime;
}

interface IssueLoginCredential {
  readonly credentialHash: TokenHash;
  readonly identity: IdentityName;
  readonly host: string;
  readonly now: IsoTime;
  readonly parent: TokenHash | undefined;
}

interface ApproveLoginRequest {
  readonly userCode: string;
  readonly approver: IdentityName;
  readonly now: IsoTime;
  readonly approvedWith?: TokenHash | undefined;
}

interface UseLoginCredential {
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

type LoginCredentialLookup =
  | {
      readonly status: "active";
      readonly identity: Identity;
      readonly lastUsedAt: IsoTime;
      readonly expiresAt: IsoTime;
    }
  | { readonly status: "expired" }
  | { readonly status: "unknown" };

type LoginCollection =
  | { readonly status: "pending" }
  | { readonly status: "collected"; readonly identity: Identity }
  | { readonly status: "gone" };

interface LoginRequestsSection {
  readonly addLoginRequest: (request: NewLoginRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findLoginRequest: (userCode: string, now: IsoTime) => Fails<LoginRequest | undefined>;
  readonly approveLoginRequest: (approve: ApproveLoginRequest) => Fails<"approved" | "not_found">;
  readonly collectLoginRequest: (collect: CollectLoginRequest) => Fails<LoginCollection>;
  readonly issueLoginCredential: (issue: IssueLoginCredential) => Fails<Identity | undefined>;
  readonly findLoginCredential: (hash: TokenHash) => Fails<Identity | undefined>;
  readonly useLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly checkLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly revokeLoginCredential: (hash: TokenHash, now: IsoTime) => Fails<boolean>;
}

const EXPIRED: LoginCredentialLookup = { status: "expired" };
const UNKNOWN: LoginCredentialLookup = { status: "unknown" };

function loginCredentialExpiry(lastUsedAt: IsoTime): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(lastUsedAt), { seconds: loginCredentialIdleSeconds }));
}

const PENDING: LoginCollection = { status: "pending" };
const GONE: LoginCollection = { status: "gone" };

function collected(identity: Identity): LoginCollection {
  return { identity, status: "collected" };
}

const LOGIN_REQUEST_KINDS_MIGRATION =
  "ALTER TABLE login_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'cli' CHECK (kind IN ('web', 'cli'));";

const POSTGRES_LOGIN_REQUEST_KINDS_MIGRATION: readonly string[] = [
  `ALTER TABLE login_requests ADD COLUMN kind text COLLATE "C" NOT NULL DEFAULT 'cli' CHECK (kind IN ('web', 'cli'))`,
];

export {
  type ApproveLoginRequest,
  LOGIN_REQUEST_KINDS_MIGRATION,
  type LoginRequestKind,
  POSTGRES_LOGIN_REQUEST_KINDS_MIGRATION,
  type CollectLoginRequest,
  EXPIRED,
  GONE,
  type LoginCredentialLookup,
  UNKNOWN,
  type UseLoginCredential,
  loginCredentialExpiry,
  type IssueLoginCredential,
  type LoginCollection,
  type LoginRequest,
  type LoginRequestsSection,
  type NewLoginRequest,
  PENDING,
  collected,
};
export { originColumns, originOf } from "./request-origins.ts";

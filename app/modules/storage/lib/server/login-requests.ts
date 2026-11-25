import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";

interface NewLoginRequest {
  readonly requestHash: TokenHash;
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface LoginRequest {
  readonly userCode: string;
  readonly host: string;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

interface CollectLoginRequest {
  readonly requestHash: TokenHash;
  readonly credentialHash: TokenHash;
  readonly now: IsoTime;
}

interface IssueLoginCredential {
  readonly credentialHash: TokenHash;
  readonly identity: IdentityName;
  readonly host: string;
  readonly now: IsoTime;
  readonly madeWith: TokenHash;
}

type LoginCollection =
  | { readonly status: "pending" }
  | { readonly status: "collected"; readonly identity: Identity }
  | { readonly status: "gone" };

interface LoginRequestsSection {
  readonly addLoginRequest: (request: NewLoginRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findLoginRequest: (userCode: string, now: IsoTime) => Fails<LoginRequest | undefined>;
  readonly approveLoginRequest: (
    userCode: string,
    approver: IdentityName,
    now: IsoTime,
  ) => Fails<"approved" | "not_found">;
  readonly collectLoginRequest: (collect: CollectLoginRequest) => Fails<LoginCollection>;
  readonly issueLoginCredential: (issue: IssueLoginCredential) => Fails<Identity | undefined>;
  readonly findLoginCredential: (hash: TokenHash) => Fails<Identity | undefined>;
  readonly revokeLoginCredential: (hash: TokenHash) => Fails<boolean>;
  readonly revokeLoginCredentialsMadeWithRevokedTokens: (identity: IdentityName) => Fails<readonly TokenHash[]>;
}

const PENDING: LoginCollection = { status: "pending" };
const GONE: LoginCollection = { status: "gone" };

function collected(identity: Identity): LoginCollection {
  return { identity, status: "collected" };
}

export {
  type CollectLoginRequest,
  GONE,
  type IssueLoginCredential,
  type LoginCollection,
  type LoginRequest,
  type LoginRequestsSection,
  type NewLoginRequest,
  PENDING,
  collected,
};

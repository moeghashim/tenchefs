import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { IssueAgentSession, IssueAgentSessionResult } from "./agent-sessions.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { Predicate } from "effect";
import { renewedExpiry } from "./agent-sessions.ts";

interface NewJoinCode {
  readonly codeHash: TokenHash;
  readonly agent: IdentityName;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly parent?: TokenHash | undefined;
}

interface RedeemJoinCode {
  readonly codeHash: TokenHash;
  readonly sessionHash: TokenHash;
  readonly idleSeconds: number;
  readonly now: IsoTime;
  readonly host?: string;
  readonly sessionUrl?: string;
}

type JoinCodeRedemption =
  | { readonly status: "gone" }
  | { readonly status: "deactivated"; readonly identity: IdentityName }
  | { readonly status: "live"; readonly identity: IdentityName; readonly expiresAt: IsoTime }
  | {
      readonly status: "redeemed";
      readonly identity: IdentityName;
      readonly issuedAt: IsoTime;
      readonly expiresAt: IsoTime;
      readonly sessionUrl?: string;
    };

interface JoinCodesSection {
  readonly addJoinCode: (code: NewJoinCode) => Fails<void>;
  readonly redeemJoinCode: (redeem: RedeemJoinCode) => Fails<JoinCodeRedemption>;
}

const GONE: JoinCodeRedemption = { status: "gone" };

interface Redeeming {
  readonly agent: IdentityName;
  readonly redeem: RedeemJoinCode;
}

interface Issued {
  readonly issue: IssueAgentSession;
  readonly result: IssueAgentSessionResult;
}

function withOptional<Fields extends object, Key extends string>(
  fields: Fields,
  key: Key,
  value: string | undefined,
): Fields & Partial<Record<Key, string>> {
  if (Predicate.isUndefined(value)) {
    return fields;
  }
  return { ...fields, [key]: value };
}

function sessionFor({ agent, redeem }: Redeeming): IssueAgentSession {
  const { host, idleSeconds, now, sessionHash, sessionUrl } = redeem;
  const expiresAt = renewedExpiry({ idleSeconds, now });
  const session = { expiresAt, hash: sessionHash, identity: agent, idleSeconds, issuedAt: now };
  return {
    force: false,
    parent: redeem.codeHash,
    session: withOptional(withOptional(session, "host", host), "sessionUrl", sessionUrl),
  };
}

function redemptionOf({ issue, result }: Issued): JoinCodeRedemption {
  const { expiresAt, identity, issuedAt, sessionUrl } = issue.session;
  if (result.status === "live") {
    return { expiresAt: result.expiresAt, identity, status: "live" };
  }
  return withOptional({ expiresAt, identity, issuedAt, status: "redeemed" } as const, "sessionUrl", sessionUrl);
}

export { GONE, redemptionOf, sessionFor };

export type { JoinCodeRedemption, JoinCodesSection, NewJoinCode, RedeemJoinCode };

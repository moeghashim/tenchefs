import { Array as Arr, Effect, Random, Schema } from "effect";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import { isPublicId } from "../../../logins/index.ts";

type LineageKind = "web" | "cli" | "agent session" | "join code" | "login link";

type SessionKind = "web" | "cli";

type EndedWhy = "revoked" | "logged out" | "expired" | "redeemed";

interface EndedCredential {
  readonly hash: TokenHash;
  readonly identity: IdentityName;
  readonly kind: "session" | "agent session" | "join code" | "login link";
}

interface NewLineage {
  readonly hash: TokenHash;
  readonly publicId: PublicId;
  readonly kind: LineageKind;
  readonly identity: IdentityName;
  readonly parent: TokenHash | undefined;
  readonly madeAt: IsoTime;
  readonly where?: string | undefined;
}

interface SessionMadeBy {
  readonly kind: SessionKind | "identity token";
  readonly where?: string;
}

interface ListedSession {
  readonly id: PublicId;
  readonly kind: SessionKind;
  readonly where: string;
  readonly madeAt: IsoTime;
  readonly lastUsedAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly current: boolean;
  readonly madeBy?: SessionMadeBy;
}

interface ListSessions {
  readonly identity: IdentityName;
  readonly current: TokenHash | undefined;
  readonly now: IsoTime;
}

interface RevokeSession {
  readonly identity: IdentityName;
  readonly id: PublicId;
  readonly now: IsoTime;
}

interface LogOutEverywhere {
  readonly identity: IdentityName;
  readonly current: TokenHash | undefined;
  readonly now: IsoTime;
}

type RevokeSessionResult =
  | { readonly status: "not_found" }
  | { readonly status: "revoked"; readonly ended: readonly EndedCredential[] };

interface LineageSection {
  readonly listSessions: (list: ListSessions) => Fails<readonly ListedSession[]>;
  readonly revokeSession: (revoke: RevokeSession) => Fails<RevokeSessionResult>;
  readonly revokeBelowRevokedTokens: (identity: IdentityName, now: IsoTime) => Fails<readonly EndedCredential[]>;
  readonly endCredentialsOf: (identity: IdentityName, now: IsoTime) => Fails<readonly EndedCredential[]>;
  readonly previewLogOutEverywhere: (request: LogOutEverywhere) => Fails<readonly EndedCredential[]>;
  readonly logOutEverywhere: (request: LogOutEverywhere) => Fails<readonly EndedCredential[]>;
}

const PUBLIC_ID_DIGITS = 16;
const FIRST_DIGIT = 1;
const LOWEST = 0;
const HEX = 16;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const randomDigits: Effect.Effect<string> = Effect.map(
  Effect.forEach(
    Arr.range(FIRST_DIGIT, PUBLIC_ID_DIGITS),
    () => Random.nextIntBetween(LOWEST, HEX, { halfOpen: true }),
    ONE_AT_A_TIME,
  ),
  (digits: readonly number[]) =>
    Arr.join(
      Arr.map(digits, (digit) => digit.toString(HEX)),
      "",
    ),
);

const PublicIdText = Schema.String.pipe(Schema.refine(isPublicId));

const newPublicId: Effect.Effect<PublicId> = Effect.orDie(
  Effect.flatMap(randomDigits, (digits) => Schema.decodeEffect(PublicIdText)(digits)),
);

const UNNAMED_WHERE = "web browser";

function unnamedWhere(): string {
  return UNNAMED_WHERE;
}

interface MadeByRow {
  readonly identity: IdentityName;
  readonly parentKind: string | undefined;
  readonly parentWhere: string;
  readonly parentIdentity: IdentityName | undefined;
  readonly tokenHolder: IdentityName | undefined;
}

function isSessionKind(kind: string | undefined): kind is SessionKind {
  return kind === "web" || kind === "cli";
}

function madeByOf({ identity, parentIdentity, parentKind, parentWhere, tokenHolder }: MadeByRow): {
  readonly madeBy?: SessionMadeBy;
} {
  if (parentIdentity === identity && isSessionKind(parentKind)) {
    return { madeBy: { kind: parentKind, where: parentWhere } };
  }
  if (tokenHolder === identity) {
    return { madeBy: { kind: "identity token" } };
  }
  return {};
}

export {
  type EndedCredential,
  type EndedWhy,
  type LineageSection,
  type ListSessions,
  type LogOutEverywhere,
  type ListedSession,
  type NewLineage,
  type RevokeSession,
  type RevokeSessionResult,
  isSessionKind,
  madeByOf,
  newPublicId,
  unnamedWhere,
};

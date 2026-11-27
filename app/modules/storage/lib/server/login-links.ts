import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";

interface NewLoginLink {
  readonly linkHash: TokenHash;
  readonly identity: IdentityName;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly parent: TokenHash | undefined;
}

interface RedeemLoginLink {
  readonly linkHash: TokenHash;
  readonly credentialHash: TokenHash;
  readonly host: string;
  readonly now: IsoTime;
}

type LoginLinkRedemption = { readonly status: "gone" } | { readonly status: "redeemed"; readonly identity: Identity };

interface LoginLinksSection {
  readonly addLoginLink: (link: NewLoginLink) => Fails<void>;
  readonly redeemLoginLink: (redeem: RedeemLoginLink) => Fails<LoginLinkRedemption>;
}

function linkGone(): LoginLinkRedemption {
  return { status: "gone" };
}

function linkRedeemed(identity: Identity): LoginLinkRedemption {
  return { identity, status: "redeemed" };
}

const LOGIN_LINKS_TABLE = `CREATE TABLE login_links (
  link_hash TEXT PRIMARY KEY,
  identity_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`;

const LOGIN_LINKS_MIGRATION = `${LOGIN_LINKS_TABLE} STRICT;`;

const POSTGRES_LOGIN_LINKS_MIGRATION: readonly string[] = [
  `CREATE TABLE login_links (
     link_hash text COLLATE "C" PRIMARY KEY,
     identity_name text COLLATE "C" NOT NULL,
     created_at text COLLATE "C" NOT NULL,
     expires_at text COLLATE "C" NOT NULL
   )`,
];

export {
  LOGIN_LINKS_MIGRATION,
  POSTGRES_LOGIN_LINKS_MIGRATION,
  linkGone,
  linkRedeemed,
  type LoginLinkRedemption,
  type LoginLinksSection,
  type NewLoginLink,
  type RedeemLoginLink,
};

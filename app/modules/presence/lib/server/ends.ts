import type { Connection, End, SentWith } from "./book.ts";
import type { EndedTokens, TokensEnded } from "../../../identities/server.ts";
import type { Identity, TokenHash } from "../../../identities/index.ts";
import { agentSessionExpired, agentSessionRevoked } from "../../../agent-sessions/index.ts";
import type { OfflineReason } from "../../index.ts";
import { Option } from "effect";
import type { Refusal } from "../../../http/index.ts";
import { THE_COOKOUT } from "../../../identities/server.ts";

type Cause = TokensEnded["cause"];

const UNAUTHORIZED = 401;

const refusals: Readonly<Record<Cause, Refusal>> = {
  deactivated: {
    code: "token_revoked",
    message: "This identity was deactivated, so none of its tokens work.",
    status: UNAUTHORIZED,
  },
  left: {
    code: agentSessionRevoked,
    message: "This agent session token was revoked by leave. Join again.",
    status: UNAUTHORIZED,
  },
  revoked: {
    code: agentSessionRevoked,
    message:
      "This agent session token was revoked (by its owner, an admin, or another session's join --force). Join again.",
    status: UNAUTHORIZED,
  },
  rotated: {
    code: "token_revoked",
    message: "This token was rotated. Use the new one.",
    status: UNAUTHORIZED,
  },
};

const reasons: Readonly<Record<Cause, OfflineReason>> = {
  deactivated: "deactivated",
  left: "left",
  revoked: "session revoked",
  rotated: "token rotated",
};

function refusalFor(cause: Cause): Refusal {
  return refusals[cause];
}

function ownedBy(identity: Identity, by: TokensEnded["by"]): boolean {
  return identity.kind === "agent" && identity.owner === by;
}

function expected(ended: TokensEnded, found: Option.Option<Identity>): boolean {
  return (
    ended.by === THE_COOKOUT ||
    ended.by === ended.identity ||
    Option.exists(found, (identity) => ownedBy(identity, ended.by))
  );
}

function endOfTokens({ ended, found }: { readonly ended: TokensEnded; readonly found: Option.Option<Identity> }): End {
  return { offlineReason: reasons[ended.cause], unexpected: !expected(ended, found) };
}

function refusedEnd({ code }: Refusal): End {
  if (code === agentSessionExpired) {
    return { offlineReason: "session expired", unexpected: true };
  }
  return { offlineReason: "session revoked", unexpected: true };
}

function hashOf(sentWith: SentWith): TokenHash | null {
  if (sentWith.kind === "agent session") {
    return sentWith.hash;
  }
  return null;
}

function madeWithIdentityToken(sentWith: SentWith, loginCredentials: readonly TokenHash[]): boolean {
  if (sentWith.kind === "identity token") {
    return true;
  }
  if (sentWith.kind === "web") {
    return Option.match(sentWith.loginCredential, {
      onNone: () => true,
      onSome: (hash) => loginCredentials.includes(hash),
    });
  }
  return false;
}

function sentWithEnded(tokens: EndedTokens): (connection: Connection) => boolean {
  return ({ sentWith }) => {
    if (tokens.kind === "all") {
      return true;
    }
    if (tokens.kind === "agent session") {
      return hashOf(sentWith) === tokens.hash;
    }
    if (tokens.kind === "agent sessions") {
      return sentWith.kind === "agent session";
    }
    return madeWithIdentityToken(sentWith, tokens.loginCredentials);
  };
}

export { endOfTokens, refusalFor, refusedEnd, sentWithEnded };

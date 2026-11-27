import { DateTime, Effect, Option, Predicate } from "effect";
import type { Identity, TokenHash } from "../../index.ts";
import type {
  LoginCredentialLookup,
  Storage,
  StorageUnavailable,
  WebhookCommandTokenGrant,
} from "../../../storage/server.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { loginExpired } from "../../../logins/index.ts";

const tokenUnknown: Refusal = {
  code: "token_unknown",
  message: "This token is not known to this cookout.",
  status: 401,
};

const tokenExpired: Refusal = {
  code: "token_expired",
  message: "This command token expired 24 h after its call.",
  status: 401,
};

const loginExpiredRefusal: Refusal = {
  code: loginExpired,
  message: "This login ended after 90 days unused. Log in again.",
  status: 401,
};

interface Principal {
  readonly identity: Identity;
  readonly webhookCommandThread: Option.Option<MessageId>;
  readonly agentSession: Option.Option<TokenHash>;
  readonly loginCredential: Option.Option<TokenHash>;
  readonly credential?: TokenHash;
}

function grantPrincipal(grant: WebhookCommandTokenGrant): Effect.Effect<Principal, Refusal> {
  return Effect.gen(function* checkWebhookCommandToken() {
    const now = yield* DateTime.now;
    if (DateTime.isGreaterThanOrEqualTo(now, DateTime.makeUnsafe(grant.expiresAt))) {
      return yield* Effect.fail(tokenExpired);
    }
    return {
      agentSession: Option.none(),
      identity: grant.handler,
      loginCredential: Option.none(),
      webhookCommandThread: Option.some(grant.threadId),
    };
  });
}

interface LoginLookup {
  readonly hash: TokenHash;
  readonly storage: Storage["Service"];
}

type EndedLogin = Exclude<LoginCredentialLookup["status"], "active">;

function loginEnded(status: EndedLogin): Refusal {
  if (status === "expired") {
    return loginExpiredRefusal;
  }
  return tokenUnknown;
}

function loginPrincipal({ hash, storage }: LoginLookup): Effect.Effect<Principal, Refusal | StorageUnavailable> {
  return Effect.gen(function* useLoginCredential() {
    const now = yield* DateTime.now;
    const used = yield* storage.useLoginCredential({ hash, now: isoTimeOf(now) });
    if (used.status !== "active") {
      return yield* Effect.fail(loginEnded(used.status));
    }
    return {
      agentSession: Option.none(),
      identity: used.identity,
      loginCredential: Option.some(hash),
      webhookCommandThread: Option.none(),
    };
  });
}

function webhookCommandTokenPrincipal(lookup: LoginLookup) {
  return (grant: WebhookCommandTokenGrant | undefined): Effect.Effect<Principal, Refusal | StorageUnavailable> => {
    if (Predicate.isUndefined(grant)) {
      return loginPrincipal(lookup);
    }
    return grantPrincipal(grant);
  };
}

export { type Principal, loginEnded, webhookCommandTokenPrincipal };

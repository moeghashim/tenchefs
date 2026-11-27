import { AddressLimit, now, webSessionWhere } from "./login-support.ts";
import { Effect, Schema } from "effect";
import { hashOf, issueToken } from "./auth.ts";
import { loginLinkNotFound, redeemLoginLinkPath } from "../../../logins/index.ts";
import { HttpServerRequest } from "effect/http";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import type { Secrets } from "./auth.ts";
import { Storage } from "../../../storage/server.ts";
import { clientAddress } from "../../../http/server.ts";
import { signedInRoute } from "./session.ts";
import { token } from "../../index.ts";

const NOT_FOUND = 404;

const linkNotFound: Refusal = {
  code: loginLinkNotFound,
  message: "There is no such login link: it was used, it expired, or it never existed. Ask an admin for a new one.",
  status: NOT_FOUND,
};

const RedeemLoginLinkRequestSchema = Schema.Struct({ secret: Schema.String });

const sentLinkHash = Effect.flatMap(HttpServerRequest.schemaBodyJson(RedeemLoginLinkRequestSchema), ({ secret }) =>
  hashOf(token(secret)),
);

const admitted = Effect.gen(function* admitAddress() {
  const limit = yield* AddressLimit;
  const address = yield* clientAddress;
  yield* limit.admit(address);
});

const admittedLinkHash = Effect.andThen(admitted, sentLinkHash);

const redeemed = Effect.gen(function* redeemLoginLink() {
  const linkHash = yield* admittedLinkHash;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const storage = yield* Storage;
  const issued = yield* issueToken;
  const at = yield* now;
  const host = webSessionWhere(request.headers["user-agent"]);
  const redemption = yield* storage.redeemLoginLink({ credentialHash: issued.hash, host, linkHash, now: at });
  if (redemption.status === "gone") {
    return yield* Effect.fail(linkNotFound);
  }
  return { identity: redemption.identity, token: issued.token };
});

const redeemRoute: Route<Storage | Secrets | AddressLimit> = signedInRoute({
  method: "POST",
  path: redeemLoginLinkPath,
  signIn: redeemed,
});

export const openLoginLinkRoutes: readonly Route<Storage | Secrets | AddressLimit>[] = [redeemRoute];

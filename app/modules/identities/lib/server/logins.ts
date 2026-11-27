import {
  AddressLimit,
  lifetimeOf,
  loginRequestDetails,
  loginRequestNotFound,
  now,
  requestOriginOf,
  requireHuman,
  webSessionWhere,
} from "./login-support.ts";
import { Caller, CredentialSent, credentialsOf, sentToken } from "./auth.ts";
import {
  CollectLoginRequestSchema,
  ListSessionsResponseSchema,
  LogOutEverywherePreviewSchema,
  LogOutEverywhereResponseSchema,
  LoginCollectedResponseSchema,
  LoginRequestResponseSchema,
  LoginRequestStartedResponseSchema,
  LogoutResponseSchema,
  RevokeSessionResponseSchema,
  StartLoginRequestSchema,
  WebLoginCollectedResponseSchema,
} from "./login-wire.ts";
import { Effect, Function, Option, Predicate } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { Identity, Token } from "../../index.ts";
import type {
  LoginCollection,
  LoginRequest,
  LoginRequestKind,
  NewLoginRequest,
  StorageUnavailable,
} from "../../../storage/server.ts";
import type { LoginRequestStartedResponse, LoginRequestView } from "../../../logins/index.ts";
import {
  approvalPath,
  collectLoginRequestPath,
  isUserCode,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestSeconds,
  loginRequestsPath,
} from "../../../logins/index.ts";
import { clientAddress, siteCookieOptions } from "../../../http/server.ts";
import { sessionCookieName, token } from "../../index.ts";
import type { Route } from "../../../http/server.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";

type Answer = HttpServerResponse.HttpServerResponse;

const CREATED = 201;
const ACCEPTED = 202;

function withinAddressLimit<Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
): Effect.Effect<
  Value,
  Failure | typeof loginRequestNotFound,
  Needs | AddressLimit | HttpServerRequest.HttpServerRequest
> {
  return Effect.gen(function* admitAddressThenRun() {
    const limit = yield* AddressLimit;
    const address = yield* clientAddress;
    yield* limit.admit(address);
    return yield* effect;
  });
}

type UnnamedRequest = Omit<NewLoginRequest, "userCode">;

const codeTaken = new Error("The new user code was taken: start again.");

function addWithCode(request: UnnamedRequest): Effect.Effect<string, StorageUnavailable, Storage | Secrets> {
  return Effect.gen(function* addRequest() {
    const storage = yield* Storage;
    const secrets = yield* Secrets;
    const userCode = yield* secrets.newUserCode;
    const added = storage.addLoginRequest({ ...request, userCode }, request.createdAt);
    yield* Effect.filterOrElse(added, (result) => result === "added", Function.constant(Effect.die(codeTaken)));
    return userCode;
  });
}

interface KindAndHost {
  readonly kind: LoginRequestKind;
  readonly host: string;
}

function kindAndHost(
  body: typeof StartLoginRequestSchema.Type,
  headers: Readonly<Record<string, string | undefined>>,
): KindAndHost {
  if ("kind" in body) {
    return { host: webSessionWhere(headers["user-agent"]), kind: body.kind };
  }
  return { host: body.host, kind: "cli" };
}

const newRequest = Effect.gen(function* newLoginRequest() {
  const body = yield* HttpServerRequest.schemaBodyJson(StartLoginRequestSchema);
  const { headers } = yield* HttpServerRequest.HttpServerRequest;
  const origin = requestOriginOf({ clientIp: yield* clientAddress, headers });
  const secrets = yield* Secrets;
  const requestId = yield* secrets.newToken;
  const requestHash = yield* secrets.hashToken(requestId);
  const { createdAt, expiresAt } = yield* lifetimeOf(loginRequestSeconds);
  return { request: { ...origin, ...kindAndHost(body, headers), createdAt, expiresAt, requestHash }, requestId };
});

const startRoute: Route<Storage | Secrets | AddressLimit> = {
  handle: () =>
    withinAddressLimit(
      Effect.gen(function* startLoginRequest() {
        const { request, requestId } = yield* newRequest;
        const userCode = yield* addWithCode(request);
        const { expiresAt } = request;
        const started: LoginRequestStartedResponse = {
          approvalPath,
          expiresAt,
          requestId,
          userCode,
        };
        return yield* HttpServerResponse.schemaJson(LoginRequestStartedResponseSchema)(started, { status: CREATED });
      }),
    ),
  method: "POST",
  path: loginRequestsPath,
};

const collectedResponse = HttpServerResponse.schemaJson(LoginCollectedResponseSchema);

const webCollectedResponse = HttpServerResponse.schemaJson(WebLoginCollectedResponseSchema);

interface Collected {
  readonly collection: LoginCollection;
  readonly issued: Token;
  readonly kind: LoginRequestKind;
}

function approvedAnswer(
  identity: Identity,
  { issued, kind }: Omit<Collected, "collection">,
): Effect.Effect<Answer, never, HttpServerRequest.HttpServerRequest> {
  if (kind === "web") {
    return Effect.gen(function* setSessionCookie() {
      const response = yield* webCollectedResponse({ identity, status: "approved" });
      const options = yield* siteCookieOptions;
      return yield* HttpServerResponse.setCookie(response, sessionCookieName, issued, options);
    }).pipe(Effect.orDie);
  }
  return Effect.orDie(collectedResponse({ identity, status: "approved", token: issued }));
}

function collectionAnswer(
  collected: Collected,
): Effect.Effect<Answer, typeof loginRequestNotFound, HttpServerRequest.HttpServerRequest> {
  const { collection } = collected;
  if (collection.status === "pending") {
    return Effect.orDie(collectedResponse({ status: "pending" }, { status: ACCEPTED }));
  }
  if (collection.status === "gone") {
    return Effect.fail(loginRequestNotFound);
  }
  return approvedAnswer(collection.identity, collected);
}

const collectRoute: Route<Storage | Secrets | AddressLimit> = {
  handle: () =>
    withinAddressLimit(
      Effect.gen(function* collectLoginRequest() {
        const { kind = "cli", requestId } = yield* HttpServerRequest.schemaBodyJson(CollectLoginRequestSchema);
        const secrets = yield* Secrets;
        const storage = yield* Storage;
        const requestHash = yield* secrets.hashToken(token(requestId));
        const issued = yield* secrets.newToken;
        const credentialHash = yield* secrets.hashToken(issued);
        const at = yield* now;
        const collection = yield* storage.collectLoginRequest({ credentialHash, kind, now: at, requestHash });
        return yield* collectionAnswer({ collection, issued, kind });
      }),
    ),
  method: "POST",
  path: collectLoginRequestPath,
};

function codeParam(params: Readonly<Record<string, string>>): string {
  return String(params["code"]);
}

function viewOf({ approved, expiresAt, host, userCode, ...started }: LoginRequest): LoginRequestView {
  return { ...loginRequestDetails({ ...started, host }), approved, expiresAt, host, userCode };
}

function requestAnswer(found: LoginRequest | undefined): Effect.Effect<Answer, typeof loginRequestNotFound> {
  if (Predicate.isUndefined(found)) {
    return Effect.fail(loginRequestNotFound);
  }
  return Effect.orDie(HttpServerResponse.schemaJson(LoginRequestResponseSchema)({ loginRequest: viewOf(found) }));
}

const userCodeSegments = { code: isUserCode };

const showRoute: Route<Caller | Storage> = {
  handle: (params) =>
    Effect.gen(function* showLoginRequest() {
      yield* requireHuman;
      const storage = yield* Storage;
      const at = yield* now;
      const found = yield* storage.findLoginRequest(codeParam(params), at);
      return yield* requestAnswer(found);
    }),
  method: "GET",
  path: loginRequestPath,
  segments: userCodeSegments,
};

const approveRoute: Route<Caller | Storage> = {
  handle: (params) =>
    Effect.gen(function* approveLoginRequest() {
      yield* requireHuman;
      const caller = yield* Caller;
      const storage = yield* Storage;
      const at = yield* now;
      const approvedWith = yield* CredentialSent;
      yield* storage.approveLoginRequest({
        approvedWith: Option.getOrUndefined(approvedWith),
        approver: caller.name,
        now: at,
        userCode: codeParam(params),
      });
      const found = yield* storage.findLoginRequest(codeParam(params), at);
      return yield* requestAnswer(found);
    }),
  method: "PUT",
  path: loginRequestApprovalPath,
  segments: userCodeSegments,
};

const logoutRoute: Route<Storage | Secrets> = {
  handle: () =>
    Effect.gen(function* revokeLogin() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const sent = yield* sentToken(credentialsOf(request));
      const secrets = yield* Secrets;
      const storage = yield* Storage;
      const hash = yield* secrets.hashToken(sent);
      const at = yield* now;
      const revoked = yield* storage.revokeLoginCredential(hash, at);
      return yield* HttpServerResponse.schemaJson(LogoutResponseSchema)({ revoked });
    }),
  method: "DELETE",
  path: loginPath,
};

export const openLoginRoutes: readonly Route<Storage | Secrets | AddressLimit>[] = [startRoute, collectRoute];

export const loginRoutes: readonly Route<Caller | Storage | Secrets>[] = [showRoute, approveRoute, logoutRoute];

export const loginResponseSchemas = {
  ListSessionsResponse: ListSessionsResponseSchema,
  LogOutEverywherePreview: LogOutEverywherePreviewSchema,
  LogOutEverywhereResponse: LogOutEverywhereResponseSchema,
  LoginCollectedResponse: LoginCollectedResponseSchema,
  LoginRequestResponse: LoginRequestResponseSchema,
  LoginRequestStartedResponse: LoginRequestStartedResponseSchema,
  LogoutResponse: LogoutResponseSchema,
  RevokeSessionResponse: RevokeSessionResponseSchema,
  WebLoginCollectedResponse: WebLoginCollectedResponseSchema,
};

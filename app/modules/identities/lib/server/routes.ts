import { Array as Arr, Effect, Predicate } from "effect";
import { Caller, announced, issueToken, requireAdmin, requireOwnerOrAdmin } from "./auth.ts";
import { CreateIdentityRequestSchema, createAgentByAgent, createIdentity } from "./create.ts";
import {
  DeactivateIdentityResponseSchema,
  IdentityMessageCountResponseSchema,
  IdentityResponseSchema,
  IdentityWithTokenResponseSchema,
  ListIdentitiesQuerySchema,
  ListIdentitiesResponseSchema,
  LoginLinkResponseSchema,
} from "./wire.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { Identity, IdentityName, ListIdentitiesQuery } from "../../index.ts";
import type { IdentityChanges, Secrets } from "./auth.ts";
import { identitiesPath, identityAdminPath, identityPath, identityTokenPath, isIdentityName } from "../../index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import type { SetAdminResult } from "../../../storage/server.ts";
import { Storage } from "../../../storage/server.ts";
import { echoed } from "../../../http/index.ts";
import { endBelowRotated } from "./cascade.ts";
import { requestOrigin } from "../../../http/server.ts";

const CONFLICT = 409;
const PATH_BASE = "http://cookout.invalid";
const CREATED = 201;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

function identityNotFound(name: string): Refusal {
  return { code: "identity_not_found", message: `There is no identity named ${echoed(name)}.`, status: NOT_FOUND };
}

function nameParam(params: Readonly<Record<string, string>>): Effect.Effect<IdentityName, Refusal> {
  const name = String(params["name"]);
  if (isIdentityName(name)) {
    return Effect.succeed(name);
  }
  return Effect.fail(identityNotFound(name));
}

function flaggedIfHandler(identity: Identity, handlers: ReadonlySet<IdentityName>): Identity {
  if (identity.kind === "agent" && handlers.has(identity.name)) {
    return { ...identity, handler: true };
  }
  return identity;
}

function shownFor(query: ListIdentitiesQuery, stored: readonly Identity[]): readonly Identity[] {
  if (query.include === "deactivated") {
    return stored;
  }
  return Arr.filter(stored, (identity) => identity.deactivated !== true);
}

const withToken = HttpServerResponse.schemaJson(IdentityWithTokenResponseSchema);

const createRoute: Route<Caller | Storage | Secrets | IdentityChanges> = {
  handle: () =>
    Effect.gen(function* createIdentityRoute() {
      const caller = yield* Caller;
      const body = yield* HttpServerRequest.schemaBodyJson(CreateIdentityRequestSchema);
      if (caller.kind === "agent") {
        const brought = yield* createAgentByAgent({ body, caller });
        yield* announced(brought.identity);
        return yield* HttpServerResponse.schemaJson(IdentityResponseSchema)(brought, { status: CREATED });
      }
      const origin = yield* requestOrigin;
      const created = yield* createIdentity({ body, caller, origin });
      yield* announced(created.identity);
      return yield* withToken(created, { status: CREATED });
    }),
  method: "POST",
  path: identitiesPath,
};

const listRoute: Route<Storage> = {
  handle: () =>
    Effect.gen(function* listIdentitiesRoute() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
      const query = yield* HttpServerRequest.schemaSearchParams(ListIdentitiesQuerySchema, { errors: "all" }).pipe(
        Effect.provideService(HttpServerRequest.ParsedSearchParams, search),
      );
      const storage = yield* Storage;
      const commands = yield* storage.listWebhookCommands;
      const stored = yield* storage.listIdentities();
      const handlers = new Set(Arr.map(commands, ({ handler }) => handler));
      const identities = Arr.map(shownFor(query, stored), (identity) => flaggedIfHandler(identity, handlers));
      return yield* HttpServerResponse.schemaJson(ListIdentitiesResponseSchema)({ identities });
    }),
  method: "GET",
  path: identitiesPath,
};

const getRoute: Route<Storage> = {
  handle: (params) =>
    Effect.gen(function* getIdentityRoute() {
      const name = yield* nameParam(params);
      const storage = yield* Storage;
      const found = yield* storage.findIdentityByName(name);
      if (Predicate.isUndefined(found)) {
        return yield* Effect.fail(identityNotFound(name));
      }
      const commands = yield* storage.listWebhookCommands;
      const identity = flaggedIfHandler(found, new Set(Arr.map(commands, ({ handler }) => handler)));
      return yield* HttpServerResponse.schemaJson(IdentityResponseSchema)({ identity });
    }),
  method: "GET",
  path: identityPath,
};

const rotateRoute: Route<Caller | Storage | Secrets | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* rotateTokenRoute() {
      const name = yield* nameParam(params);
      yield* requireOwnerOrAdmin(name);
      const { token, hash } = yield* issueToken;
      const storage = yield* Storage;
      const result = yield* storage.replaceToken(name, hash);
      if (result.status === "not_found") {
        return yield* Effect.fail(identityNotFound(name));
      }
      yield* endBelowRotated(name);
      return yield* withToken({ identity: result.identity, token });
    }),
  method: "POST",
  path: identityTokenPath,
};

function humanOnly({ kind }: Identity): Refusal {
  return { code: "human_only", details: { kind }, message: "Only a human can be an admin.", status: FORBIDDEN };
}

function lastAdminKept(name: IdentityName): Refusal {
  return {
    code: "last_admin",
    message: `${name} is the last admin. Make another admin before removing its admin.`,
    status: CONFLICT,
  };
}

function changedIdentity(name: IdentityName, result: SetAdminResult): Effect.Effect<Identity, Refusal> {
  if (result.status === "set") {
    return Effect.succeed(result.identity);
  }
  if (result.status === "agent") {
    return Effect.fail(humanOnly(result.identity));
  }
  if (result.status === "last_admin") {
    return Effect.fail(lastAdminKept(name));
  }
  return Effect.fail(identityNotFound(name));
}

function adminFlagRoute(method: "PUT" | "DELETE"): Route<Caller | Storage | IdentityChanges> {
  return {
    handle: (params) =>
      Effect.gen(function* setAdminRoute() {
        yield* requireAdmin;
        const name = yield* nameParam(params);
        const storage = yield* Storage;
        const result = yield* storage.setAdmin(name, method === "PUT");
        const identity = yield* Effect.flatMap(changedIdentity(name, result), announced);
        return yield* HttpServerResponse.schemaJson(IdentityResponseSchema)({ identity });
      }),
    method,
    path: identityAdminPath,
  };
}

export const responseSchemas = {
  DeactivateIdentityResponse: DeactivateIdentityResponseSchema,
  IdentityMessageCountResponse: IdentityMessageCountResponseSchema,
  IdentityResponse: IdentityResponseSchema,
  IdentityWithTokenResponse: IdentityWithTokenResponseSchema,
  ListIdentitiesResponse: ListIdentitiesResponseSchema,
  LoginLinkResponse: LoginLinkResponseSchema,
};

export const identityAdminRoutes: readonly Route<Caller | Storage | Secrets | IdentityChanges>[] = [
  createRoute,
  listRoute,
  getRoute,
  rotateRoute,
  adminFlagRoute("PUT"),
  adminFlagRoute("DELETE"),
];

export { identityNotFound, nameParam };
export { endBelowDeactivated } from "./cascade.ts";
export { humanAdmin } from "./create.ts";

export { loginResponseSchemas, loginRoutes, openLoginRoutes } from "./logins.ts";
export { sessionRoutes } from "./sessions.ts";
export { loginLinkRoutes } from "./login-links.ts";
export { openLoginLinkRoutes } from "./login-link-redeem.ts";
export { AddressLimit, now } from "./login-support.ts";

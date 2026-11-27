import { Array as Arr, Effect, Option } from "effect";
import { Caller, CredentialSent, credentialsEnded } from "./auth.ts";
import type { HumanIdentity, Identity } from "../../index.ts";
import {
  ListSessionsResponseSchema,
  LogOutEverywherePreviewSchema,
  LogOutEverywhereResponseSchema,
  RevokeSessionResponseSchema,
} from "./login-wire.ts";
import type { LogOutEverywhereCounts, PublicId } from "../../../logins/index.ts";
import { isPublicId, logOutEverywherePath, sessionByIdPath, sessionsPath } from "../../../logins/index.ts";
import type { EndedCredential } from "../../../storage/server.ts";
import { HttpServerResponse } from "effect/http";
import type { IdentityChanges } from "./auth.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import { now } from "./login-support.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only a person has sessions: an agent has its agent session token.",
  status: FORBIDDEN,
};

const sessionNotFound: Refusal = {
  code: "session_not_found",
  message: "You have no live session with that ID. List yours with GET /v1/sessions.",
  status: NOT_FOUND,
};

function isHuman(caller: Identity): caller is HumanIdentity {
  return caller.kind === "human";
}

const human = Effect.filterOrFail(Caller, isHuman, () => humanOnly);

function sessionIdOf(params: Readonly<Record<string, string>>): Effect.Effect<PublicId, Refusal> {
  return Effect.filterOrFail(Effect.succeed(String(params["id"])), isPublicId, () => sessionNotFound);
}

const listRoute: Route<Caller | Storage> = {
  handle: () =>
    Effect.gen(function* listSessionsRoute() {
      const caller = yield* human;
      const storage = yield* Storage;
      const current = yield* CredentialSent;
      const at = yield* now;
      const sessions = yield* storage.listSessions({
        current: Option.getOrUndefined(current),
        identity: caller.name,
        now: at,
      });
      return yield* HttpServerResponse.schemaJson(ListSessionsResponseSchema)({ sessions });
    }),
  method: "GET",
  path: sessionsPath,
};

const revokeRoute: Route<Caller | Storage | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* revokeSessionRoute() {
      const caller = yield* human;
      const storage = yield* Storage;
      const id = yield* sessionIdOf(params);
      const at = yield* now;
      const result = yield* storage.revokeSession({ id, identity: caller.name, now: at });
      if (result.status === "not_found") {
        return yield* Effect.fail(sessionNotFound);
      }
      yield* credentialsEnded({ by: caller.name, ended: result.ended });
      return yield* HttpServerResponse.schemaJson(RevokeSessionResponseSchema)({ ended: result.ended.length });
    }),
  method: "DELETE",
  path: sessionByIdPath,
};

function countOf(ended: readonly EndedCredential[], kind: EndedCredential["kind"]): number {
  return Arr.filter(ended, (each) => each.kind === kind).length;
}

function countsOf(ended: readonly EndedCredential[]): LogOutEverywhereCounts {
  return {
    agentSessions: countOf(ended, "agent session"),
    joinCodes: countOf(ended, "join code"),
    sessions: countOf(ended, "session"),
  };
}

const everywhere = Effect.gen(function* everywhereButThisSession() {
  const caller = yield* human;
  const current = yield* CredentialSent;
  const at = yield* now;
  return { current: Option.getOrUndefined(current), identity: caller.name, now: at };
});

const previewRoute: Route<Caller | Storage> = {
  handle: () =>
    Effect.gen(function* previewLogOutEverywhereRoute() {
      const storage = yield* Storage;
      const request = yield* everywhere;
      const ending = yield* storage.previewLogOutEverywhere(request);
      return yield* HttpServerResponse.schemaJson(LogOutEverywherePreviewSchema)({ willEnd: countsOf(ending) });
    }),
  method: "GET",
  path: logOutEverywherePath,
};

const logOutEverywhereRoute: Route<Caller | Storage | IdentityChanges> = {
  handle: () =>
    Effect.gen(function* logOutEverywhereRouteHandler() {
      const storage = yield* Storage;
      const request = yield* everywhere;
      const ended = yield* storage.logOutEverywhere(request);
      yield* credentialsEnded({ by: request.identity, ended });
      return yield* HttpServerResponse.schemaJson(LogOutEverywhereResponseSchema)({ ended: countsOf(ended) });
    }),
  method: "POST",
  path: logOutEverywherePath,
};

export const sessionRoutes: readonly Route<Caller | Storage | IdentityChanges>[] = [
  listRoute,
  revokeRoute,
  previewRoute,
  logOutEverywhereRoute,
];

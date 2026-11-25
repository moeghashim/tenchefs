import { Array as Arr, Effect, Predicate } from "effect";
import {
  Caller,
  identityNotFound,
  nameParam,
  requireOwnerBringerOrAdmin,
  requireOwnerOrAdmin,
} from "../../../identities/server.ts";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { ListAgentSessionsResponse, ListedAgentSession } from "../../index.ts";
import { ListAgentSessionsResponseSchema, RevokeAgentSessionResponseSchema } from "./wire.ts";
import { AgentSessions } from "./service.ts";
import { HttpServerResponse } from "effect/http";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { identityAgentSessionPath } from "../../index.ts";

type Needs = Caller | Storage | AgentSessions;

type Permission = (name: IdentityName) => Effect.Effect<void, Refusal | StorageUnavailable, Caller | Storage>;

function managedAgent(
  params: Readonly<Record<string, string>>,
  permitted: Permission,
): Effect.Effect<Identity, Refusal | StorageUnavailable, Caller | Storage> {
  return Effect.gen(function* checkManagedAgent() {
    const name = yield* nameParam(params);
    yield* permitted(name);
    const storage = yield* Storage;
    const found = yield* storage.findIdentityByName(name);
    if (Predicate.isUndefined(found)) {
      return yield* Effect.fail(identityNotFound(name));
    }
    return found;
  });
}

function unwatched({ sessionUrl: _hidden, ...session }: ListedAgentSession): ListedAgentSession {
  return session;
}

function shownTo(caller: Identity, agent: Identity, listed: ListAgentSessionsResponse): ListAgentSessionsResponse {
  if (agent.kind === "agent" && agent.owner === caller.name) {
    return listed;
  }
  return { agentSessions: Arr.map(listed.agentSessions, unwatched) };
}

const listRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* listAgentSessionsRoute() {
      const agent = yield* managedAgent(params, requireOwnerOrAdmin);
      const caller = yield* Caller;
      const agentSessions = yield* AgentSessions;
      const listed = yield* agentSessions.listFor(agent.name);
      return yield* HttpServerResponse.schemaJson(ListAgentSessionsResponseSchema)(shownTo(caller, agent, listed));
    }),
  method: "GET",
  path: identityAgentSessionPath,
};

const revokeRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* revokeAgentSessionRoute() {
      const { name } = yield* managedAgent(params, requireOwnerBringerOrAdmin);
      const caller = yield* Caller;
      const agentSessions = yield* AgentSessions;
      const revoked = yield* agentSessions.revokeFor(name, caller.name);
      return yield* HttpServerResponse.schemaJson(RevokeAgentSessionResponseSchema)(revoked);
    }),
  method: "DELETE",
  path: identityAgentSessionPath,
};

export const ownerRoutes: readonly Route<Needs>[] = [listRoute, revokeRoute];

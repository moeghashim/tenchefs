import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { SetTriggerRequestSchema, TriggerResponseSchema, shown, withoutValues } from "./wire.ts";
import { reached, unreached } from "./reach.ts";
import type { Caller } from "../../../identities/server.ts";
import { Effect } from "effect";
import type { ReachNeeds } from "./reach.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import { checkedTrigger } from "./request.ts";
import { identityTriggerPath } from "../../index.ts";
import { ownedAgent } from "./owner.ts";

type RouteNeeds = Caller | Storage | ReachNeeds;

const triggerResponse = HttpServerResponse.schemaJson(TriggerResponseSchema);

const getRoute: Route<RouteNeeds> = {
  handle: (params) =>
    Effect.gen(function* getTriggerRoute() {
      const agent = yield* ownedAgent(params);
      const storage = yield* Storage;
      const found = yield* storage.findTrigger(agent.name);
      return yield* triggerResponse(shown(found));
    }),
  method: "GET",
  path: identityTriggerPath,
};

const setRoute: Route<RouteNeeds> = {
  handle: (params) =>
    Effect.gen(function* setTriggerRoute() {
      const agent = yield* ownedAgent(params);
      const body = yield* HttpServerRequest.schemaBodyJson(SetTriggerRequestSchema);
      const checked = yield* checkedTrigger(body);
      const storage = yield* Storage;
      yield* storage.setTrigger(agent.name, checked);
      yield* reached(agent);
      return yield* triggerResponse({ trigger: withoutValues(checked) });
    }),
  method: "PUT",
  path: identityTriggerPath,
};

const clearRoute: Route<RouteNeeds> = {
  handle: (params) =>
    Effect.gen(function* clearTriggerRoute() {
      const agent = yield* ownedAgent(params);
      const storage = yield* Storage;
      yield* storage.clearTrigger(agent.name);
      yield* unreached(agent);
      return yield* triggerResponse({ trigger: null });
    }),
  method: "DELETE",
  path: identityTriggerPath,
};

const triggerRoutes: readonly Route<RouteNeeds>[] = [getRoute, setRoute, clearRoute];

export { triggerRoutes };

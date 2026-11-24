import { Effect, Option, Predicate } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { SetTriggerRequestSchema, TriggerResponseSchema } from "./wire.ts";
import type { Trigger, TriggerResponse } from "../../index.ts";
import { identityTriggerPath, isTriggerToken } from "../../index.ts";
import { ownedAgent, tokenMissing } from "./owner.ts";
import { reached, unreached } from "./reach.ts";
import type { Caller } from "../../../identities/server.ts";
import type { ReachNeeds } from "./reach.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StoredTrigger } from "../../../storage/server.ts";
import { checkedUrl } from "./url.ts";

type RouteNeeds = Caller | Storage | ReachNeeds;

function shown(stored: StoredTrigger | undefined): TriggerResponse {
  return Option.match(Option.fromUndefinedOr(stored), {
    onNone: () => ({ trigger: null }),
    onSome: ({ lastResult, url }): TriggerResponse => {
      const trigger: Trigger = { url };
      if (Predicate.isUndefined(lastResult)) {
        return { trigger };
      }
      return { trigger: { ...trigger, lastResult } };
    },
  });
}

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
      const url = yield* checkedUrl(body.url);
      const sent = Option.liftPredicate(body.token, isTriggerToken);
      const token = yield* Effect.mapError(Effect.fromOption(sent), () => tokenMissing);
      const storage = yield* Storage;
      yield* storage.setTrigger(agent.name, { token, url });
      yield* reached(agent);
      return yield* triggerResponse({ trigger: { url } });
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

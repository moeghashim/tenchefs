import { Context, Effect, Layer, PubSub } from "effect";
import type { Identity } from "../../../identities/index.ts";
import type { Scope } from "effect";
import type { Trigger } from "../../index.ts";

interface TriggerChange {
  readonly agent: Identity;
  readonly trigger: Trigger;
}

interface TriggerChangesService {
  readonly publish: (change: TriggerChange) => Effect.Effect<void>;
  readonly changed: Effect.Effect<PubSub.Subscription<TriggerChange>, never, Scope.Scope>;
}

class TriggerChanges extends Context.Service<TriggerChanges, TriggerChangesService>()(
  "@ai-hero/cookout/triggers/lib/server/changes/TriggerChanges",
) {}

const triggerChangesLayer: Layer.Layer<TriggerChanges> = Layer.effect(
  TriggerChanges,
  Effect.gen(function* triggerChangesHub() {
    const hub = yield* PubSub.unbounded<TriggerChange>();
    return {
      changed: PubSub.subscribe(hub),
      publish: (change: TriggerChange) => Effect.asVoid(PubSub.publish(hub, change)),
    };
  }),
);

export { type TriggerChange, TriggerChanges, triggerChangesLayer };

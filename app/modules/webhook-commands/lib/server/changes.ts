import { Context, Effect, Layer, PubSub } from "effect";
import type { RegisteredWebhookCommand } from "../../index.ts";
import type { Scope } from "effect";

interface WebhookCommandChangesService {
  readonly publish: (command: RegisteredWebhookCommand) => Effect.Effect<void>;
  readonly changed: Effect.Effect<PubSub.Subscription<RegisteredWebhookCommand>, never, Scope.Scope>;
}

class WebhookCommandChanges extends Context.Service<WebhookCommandChanges, WebhookCommandChangesService>()(
  "@ai-hero/cookout/webhook-commands/lib/server/changes/WebhookCommandChanges",
) {}

const webhookCommandChangesLayer: Layer.Layer<WebhookCommandChanges> = Layer.effect(
  WebhookCommandChanges,
  Effect.gen(function* webhookCommandChangesHub() {
    const hub = yield* PubSub.unbounded<RegisteredWebhookCommand>();
    return {
      changed: PubSub.subscribe(hub),
      publish: (command: RegisteredWebhookCommand) => Effect.asVoid(PubSub.publish(hub, command)),
    };
  }),
);

function announced<Answer extends { readonly command: RegisteredWebhookCommand }>(
  answer: Answer,
): Effect.Effect<Answer, never, WebhookCommandChanges> {
  return Effect.flatMap(WebhookCommandChanges, (changes) => Effect.as(changes.publish(answer.command), answer));
}

export { WebhookCommandChanges, announced, webhookCommandChangesLayer };

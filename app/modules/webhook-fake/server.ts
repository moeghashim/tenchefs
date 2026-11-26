/**
 * A fake command handler: a real HTTP server on `127.0.0.1` and a free port
 * that stands in for the webhook a command calls. `WebhookFake` gives its base
 * URL (any path is accepted) and every call so far, oldest first, with the
 * status it answered. `failNext(count, status, body)` answers the next `count` calls
 * with `status` (default 500) and `body` as JSON (default `{ ok: false }`), then 200 again; a `3xx` one names `/redirected` on the fake as its `Location`. And `waitForCalls(count)`
 * waits until at least `count` calls have arrived. `answerWith(body)` answers every later call that succeeds with
 * `body` as JSON instead of `{ ok: true }`, so it can stand in for a routine's fire URL too. `webhookFake` is a scoped
 * Layer: the server stops, dropping open connections, when its scope closes.
 * Reachable only from tests and `testing`, which the dev program runs it from.
 */
import { Array as Arr, Context, Effect, Layer } from "effect";
import type { ReceivedCall } from "./lib/server/receiver.ts";
import { receiver } from "./lib/server/receiver.ts";

type WebhookCall = ReceivedCall;

interface WebhookFakeService {
  readonly answerWith: (body: unknown) => Effect.Effect<void>;
  readonly calls: Effect.Effect<readonly WebhookCall[]>;
  readonly failNext: (count: number, status?: number, body?: unknown) => Effect.Effect<void>;
  readonly url: string;
  readonly waitForCalls: (count: number) => Effect.Effect<readonly WebhookCall[]>;
}

const SERVER_ERROR = 500;

class WebhookFake extends Context.Service<WebhookFake, WebhookFakeService>()(
  "@ai-hero/cookout/webhook-fake/server/WebhookFake",
) {}

const webhookFake: Layer.Layer<WebhookFake> = Layer.effect(
  WebhookFake,
  Effect.map(receiver, (started) =>
    WebhookFake.of({
      answerWith: started.answerWith,
      calls: started.calls,
      failNext: (count, status = SERVER_ERROR, ...body: readonly unknown[]) =>
        started.failNext(count, status, Arr.head(body)),
      url: started.url,
      waitForCalls: started.waitForCalls,
    }),
  ),
);

export { type WebhookCall, WebhookFake, type WebhookFakeService, webhookFake };

/**
 * A scripted stand-in for the trigger URL seam: `ScriptedTriggers` records every call to a trigger URL and answers
 * each with the next scripted answer (an HTTP status with the error message its body gave, an error, or
 * `"no answer"`, which never ends), else 200.
 */
export {
  type ScriptedAnswer,
  ScriptedTriggers,
  type ScriptedTriggersService,
  scriptedTriggers,
  triggerToken,
  unusedScriptedTriggers,
} from "./lib/server/scripted-triggers.ts";

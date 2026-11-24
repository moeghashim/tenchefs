import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { TriggerToken } from "../../index.ts";

interface TriggerCall {
  readonly url: string;
  readonly token: TriggerToken;
  readonly text: string;
}

interface TriggerCallerService {
  readonly call: (call: TriggerCall) => Effect.Effect<number, string>;
}

class TriggerCaller extends Context.Service<TriggerCaller, TriggerCallerService>()(
  "@ai-hero/cookout/triggers/lib/server/caller/TriggerCaller",
) {}

const UNREACHABLE = "the trigger URL couldn't be reached";

function requestOf({ text, token, url }: TriggerCall): HttpClientRequest.HttpClientRequest {
  return HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${token}`),
    HttpClientRequest.bodyJsonUnsafe({ text }),
  );
}

function callerOn(client: HttpClient.HttpClient): TriggerCallerService {
  return {
    call: (call) =>
      client
        .execute(requestOf(call))
        .pipe(
          Effect.mapBoth({ onFailure: () => UNREACHABLE, onSuccess: ({ status }) => status }),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        ),
  };
}

const neverRedirected = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
);

const triggerCallerLive: Layer.Layer<TriggerCaller> = Layer.effect(
  TriggerCaller,
  Effect.map(HttpClient.HttpClient, callerOn),
).pipe(Layer.provide(neverRedirected));

export { type TriggerCall, TriggerCaller, type TriggerCallerService, triggerCallerLive };

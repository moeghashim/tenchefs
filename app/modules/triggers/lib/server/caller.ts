import { Array as Arr, Context, Effect, Function as Fn, Layer, Record, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { TriggerHeader, TriggerToken } from "../../index.ts";
import type { TriggerAnswer } from "./answer.ts";
import { isOkStatus } from "../../index.ts";

interface TriggerCall {
  readonly url: string;
  readonly token: TriggerToken;
  readonly headers: readonly TriggerHeader[];
  readonly text: string;
}

interface TriggerCallerService {
  readonly call: (call: TriggerCall) => Effect.Effect<TriggerAnswer, string>;
}

class TriggerCaller extends Context.Service<TriggerCaller, TriggerCallerService>()(
  "@ai-hero/cookout/triggers/lib/server/caller/TriggerCaller",
) {}

const UNREACHABLE = "the trigger URL couldn't be reached";
const NO_MESSAGE = "";
const Envelope = Schema.Struct({ error: Schema.Struct({ message: Schema.String }) });

function messageOf(response: HttpClientResponse.HttpClientResponse): Effect.Effect<string> {
  return HttpClientResponse.schemaBodyJson(Envelope)(response).pipe(
    Effect.matchEffect({ onFailure: () => response.text, onSuccess: ({ error }) => Effect.succeed(error.message) }),
    Effect.orElseSucceed(Fn.constant(NO_MESSAGE)),
  );
}

function answerOf(response: HttpClientResponse.HttpClientResponse): Effect.Effect<TriggerAnswer> {
  const { status } = response;
  if (isOkStatus(status)) {
    return Effect.succeed({ message: NO_MESSAGE, status });
  }
  return Effect.map(messageOf(response), (message) => ({ message, status }));
}

function requestOf({ headers, text, token, url }: TriggerCall): HttpClientRequest.HttpClientRequest {
  const extra = Record.fromEntries(Arr.map(headers, ({ name, value }) => [name, value] as const));
  return HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeaders(extra),
    HttpClientRequest.setHeader("authorization", `Bearer ${token}`),
    HttpClientRequest.bodyJsonUnsafe({ text }),
  );
}

function callerOn(client: HttpClient.HttpClient): TriggerCallerService {
  return {
    call: (call) =>
      client.execute(requestOf(call)).pipe(
        Effect.mapError(() => UNREACHABLE),
        Effect.flatMap(answerOf),
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

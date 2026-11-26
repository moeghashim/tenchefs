import { Effect, Layer, Option, Ref, Stream, SubscriptionRef } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { nodeHttpServer, serverUrl } from "../../../http/server.ts";
import type { Scope } from "effect";

interface ReceivedCall {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly status: number;
}

interface Receiver {
  readonly answerWith: (body: unknown) => Effect.Effect<void>;
  readonly calls: Effect.Effect<readonly ReceivedCall[]>;
  readonly failNext: (count: number, status: number, body: Option.Option<unknown>) => Effect.Effect<void>;
  readonly url: string;
  readonly waitForCalls: (count: number) => Effect.Effect<readonly ReceivedCall[]>;
}

const OK = 200;
const FIRST_FAILURE = 400;
const FIRST_REDIRECT = 300;
const REDIRECTED = { location: "/redirected" } as const;
const LISTEN = { host: "127.0.0.1", port: 0 } as const;

function headersFor(status: number): Readonly<Record<string, string>> {
  if (status >= FIRST_REDIRECT && status < FIRST_FAILURE) {
    return REDIRECTED;
  }
  return {};
}

interface Failure {
  readonly status: number;
  readonly body: Option.Option<unknown>;
}

const SUCCEED: Failure = { body: Option.none(), status: OK };

function answerFor(ok: boolean, given: Option.Option<unknown>, failure: Failure): unknown {
  return Option.getOrElse(
    Option.orElse(failure.body, () => Option.filter(given, () => ok)),
    () => ({ ok }),
  );
}

function nextFailure(queued: readonly Failure[]): readonly [Failure, readonly Failure[]] {
  const [next = SUCCEED, ...rest] = queued;
  return [next, rest];
}

const receiver: Effect.Effect<Receiver, never, Scope.Scope> = Effect.gen(function* startReceiver() {
  const calls = yield* SubscriptionRef.make<readonly ReceivedCall[]>([]);
  const failures = yield* Ref.make<readonly Failure[]>([]);
  const answer = yield* Ref.make<Option.Option<unknown>>(Option.none());

  const receive = Effect.gen(function* receiveCall() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const rawBody = yield* Effect.orDie(request.text);
    const body = yield* Effect.option(request.json);
    const failure = yield* Ref.modify(failures, nextFailure);
    const { status } = failure;
    const call: ReceivedCall = {
      body: Option.getOrUndefined(body),
      headers: request.headers,
      method: request.method,
      path: request.url,
      rawBody,
      status,
    };
    yield* SubscriptionRef.update(calls, (before) => [...before, call]);
    const ok = status < FIRST_FAILURE;
    const answered = yield* Effect.map(Ref.get(answer), (given) => answerFor(ok, given, failure));
    return HttpServerResponse.jsonUnsafe(answered, { headers: headersFor(status), status });
  });

  function failNext(count: number, status: number, body: Option.Option<unknown>): Effect.Effect<void> {
    const more = Array.from({ length: count }, () => ({ body, status }));
    return Ref.update(failures, (queued) => [...queued, ...more]);
  }

  function waitForCalls(count: number): Effect.Effect<readonly ReceivedCall[]> {
    return SubscriptionRef.changes(calls).pipe(
      Stream.filter((received) => received.length >= count),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
  }

  const serving = HttpServer.serve(receive).pipe(Layer.provideMerge(nodeHttpServer(LISTEN)));
  const server = yield* Layer.build(serving);
  const url = yield* Effect.provideContext(serverUrl, server);
  return {
    answerWith: (given: unknown) => Ref.set(answer, Option.some(given)),
    calls: SubscriptionRef.get(calls),
    failNext,
    url,
    waitForCalls,
  };
}).pipe(Effect.orDie);

export { type ReceivedCall, receiver };

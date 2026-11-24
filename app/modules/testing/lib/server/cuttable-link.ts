import { Boolean as Bool, Context, Deferred, Effect, Layer, Ref, String as Str, Stream, SubscriptionRef } from "effect";
import {
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpMethod,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import type { HttpClientError, HttpClientResponse, HttpServerError } from "effect/http";
import { nodeHttpServer, serverUrl } from "../../../http/server.ts";
import type { Scope } from "effect";
import { layerNodeHttp as nodeHttpClient } from "@effect/platform-node/NodeHttpClient";

interface CuttableLink {
  readonly url: string;
  readonly cut: Effect.Effect<void>;
  readonly stall: Effect.Effect<void>;
  readonly freeze: Effect.Effect<void>;
  readonly takeDown: Effect.Effect<void>;
  readonly badGatewayFor: (requests: number, path?: string) => Effect.Effect<void>;
  readonly answeredBadGateway: (times: number) => Effect.Effect<void>;
  readonly relayed: (text: string, times?: number) => Effect.Effect<void>;
}

interface Signal {
  readonly fire: Effect.Effect<void>;
  readonly current: Effect.Effect<Deferred.Deferred<boolean>>;
}

interface Relay {
  readonly target: string;
  readonly isDown: Effect.Effect<boolean>;
  readonly isFrozen: Effect.Effect<boolean>;
  readonly unanswered: Effect.Effect<HttpServerResponse.HttpServerResponse>;
  readonly takesBadGateway: (url: string) => Effect.Effect<boolean>;
  readonly answerBadGateway: Effect.Effect<HttpServerResponse.HttpServerResponse>;
  readonly dropped: Effect.Effect<Effect.Effect<boolean>>;
  readonly stalled: Effect.Effect<Effect.Effect<boolean>>;
  readonly record: (text: string) => Effect.Effect<void>;
  readonly execute: (
    request: HttpClientRequest.HttpClientRequest,
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>;
}

const LISTEN = { host: "127.0.0.1", port: 0 } as const;
const ONCE = 1;
const NONE_LEFT = 0;
const EVERY_PATH = "";
const BAD_GATEWAY = 502;
const HOP_BY_HOP = ["connection", "content-length", "host", "transfer-encoding"] as const;
const endToEnd = Headers.removeMany(HOP_BY_HOP);

const signal: Effect.Effect<Signal> = Effect.gen(function* makeSignal() {
  const first = yield* Deferred.make<boolean>();
  const signals = yield* Ref.make(first);
  const fire = Effect.gen(function* fireSignal() {
    const next = yield* Deferred.make<boolean>();
    const current = yield* Ref.getAndSet(signals, next);
    yield* Deferred.succeed(current, true);
  });
  return { current: Ref.get(signals), fire };
});

function forwardedTo(
  target: string,
  method: HttpMethod.HttpMethod,
): Effect.Effect<
  HttpClientRequest.HttpClientRequest,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> {
  return Effect.gen(function* forwardRequest() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const sent = yield* request.arrayBuffer;
    return HttpClientRequest.make(method)(`${target}${request.url}`).pipe(
      HttpClientRequest.setHeaders(endToEnd(request.headers)),
      HttpClientRequest.bodyUint8Array(new Uint8Array(sent), request.headers["content-type"]),
    );
  });
}

function relayed(
  relay: Relay,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest> {
  return Effect.gen(function* relayRequest() {
    const { method, url } = yield* HttpServerRequest.HttpServerRequest;
    if (yield* relay.isFrozen) {
      return yield* relay.unanswered;
    }
    if ((yield* relay.isDown) || (yield* relay.takesBadGateway(url)) || !HttpMethod.isHttpMethod(method)) {
      return yield* relay.answerBadGateway;
    }
    const dropped = yield* relay.dropped;
    const stalled = yield* relay.stalled;
    const answer = yield* Effect.flatMap(forwardedTo(relay.target, method), relay.execute);
    const body = answer.stream.pipe(
      Stream.decodeText(),
      Stream.filterEffect(() => Effect.map(stalled, Bool.not)),
      Stream.interruptWhen(dropped),
      Stream.tap(relay.record),
      Stream.encodeText,
    );
    return HttpServerResponse.stream(body, { headers: endToEnd(answer.headers), status: answer.status });
  }).pipe(Effect.orDie);
}

function serving(relay: Relay): Effect.Effect<string, never, Scope.Scope> {
  return Effect.gen(function* serveRelay() {
    const relaying = HttpServer.serve(relayed(relay)).pipe(Layer.provideMerge(nodeHttpServer(LISTEN)));
    const server = yield* Layer.build(relaying);
    return yield* Effect.provideContext(serverUrl, server);
  }).pipe(Effect.orDie);
}

function sentAtLeast(text: string, times: number): (sent: string) => boolean {
  return (sent) => Str.split(text)(sent).length > times;
}

interface Due {
  readonly left: number;
  readonly prefix: string;
}

interface BadGateways {
  readonly forNext: (requests: number, path?: string) => Effect.Effect<void>;
  readonly takes: (url: string) => Effect.Effect<boolean>;
  readonly answer: Effect.Effect<HttpServerResponse.HttpServerResponse>;
  readonly answered: (times: number) => Effect.Effect<void>;
}

const badGateways: Effect.Effect<BadGateways> = Effect.gen(function* makeBadGateways() {
  const due = yield* Ref.make<Due>({ left: NONE_LEFT, prefix: EVERY_PATH });
  const answered = yield* SubscriptionRef.make(NONE_LEFT);
  return {
    answer: Effect.as(
      SubscriptionRef.update(answered, (count) => count + ONCE),
      HttpServerResponse.empty({ status: BAD_GATEWAY }),
    ),
    answered: (times) =>
      SubscriptionRef.changes(answered).pipe(
        Stream.filter((count) => count >= times),
        Stream.runHead,
        Effect.asVoid,
      ),
    forNext: (requests, path = EVERY_PATH) => Ref.set(due, { left: requests, prefix: path }),
    takes: (url) =>
      Ref.modify(due, ({ left, prefix }: Due) => {
        const takes = left > NONE_LEFT && Str.startsWith(prefix)(url);
        return [takes, { left: Math.max(NONE_LEFT, left - Number(takes)), prefix }];
      }),
  };
});

interface Outage {
  readonly isDown: Effect.Effect<boolean>;
  readonly goDown: Effect.Effect<void>;
  readonly isFrozen: Effect.Effect<boolean>;
  readonly goFrozen: Effect.Effect<void>;
  readonly unanswered: Effect.Effect<HttpServerResponse.HttpServerResponse>;
  readonly answerTheFrozen: Effect.Effect<void>;
}

const outage: Effect.Effect<Outage> = Effect.gen(function* makeOutage() {
  const down = yield* Ref.make(false);
  const frozen = yield* Ref.make(false);
  const closed = yield* Deferred.make<boolean>();
  return {
    answerTheFrozen: Effect.asVoid(Deferred.succeed(closed, true)),
    goDown: Ref.set(down, true),
    goFrozen: Ref.set(frozen, true),
    isDown: Ref.get(down),
    isFrozen: Ref.get(frozen),
    unanswered: Effect.as(Deferred.await(closed), HttpServerResponse.empty({ status: BAD_GATEWAY })),
  };
});

function cuttableLink(target: string): Effect.Effect<CuttableLink, never, Scope.Scope> {
  return Effect.gen(function* openLink() {
    const client = yield* Effect.map(Layer.build(nodeHttpClient), Context.get(HttpClient.HttpClient));
    const drops = yield* signal;
    const stalls = yield* signal;
    const sent = yield* SubscriptionRef.make("");
    const outages = yield* outage;
    const gateways = yield* badGateways;
    const relay: Relay = {
      answerBadGateway: gateways.answer,
      dropped: Effect.map(drops.current, Deferred.await),
      execute: client.execute,
      isDown: outages.isDown,
      isFrozen: outages.isFrozen,
      record: (text) => SubscriptionRef.update(sent, Str.concat(text)),
      stalled: Effect.map(stalls.current, Deferred.isDone),
      takesBadGateway: gateways.takes,
      target,
      unanswered: outages.unanswered,
    };
    const url = yield* serving(relay);
    yield* Effect.addFinalizer(() => outages.answerTheFrozen);
    return {
      answeredBadGateway: gateways.answered,
      badGatewayFor: gateways.forNext,
      cut: drops.fire,
      freeze: Effect.andThen(outages.goFrozen, stalls.fire),
      relayed: (text: string, times = ONCE) =>
        SubscriptionRef.changes(sent).pipe(Stream.filter(sentAtLeast(text, times)), Stream.runHead, Effect.asVoid),
      stall: stalls.fire,
      takeDown: Effect.andThen(outages.goDown, drops.fire),
      url,
    };
  }).pipe(Effect.orDie);
}

export { type CuttableLink, cuttableLink };

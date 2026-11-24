import { Effect, Layer, Record, Ref } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { nodeHttpServer, serverUrl } from "../../../http/server.ts";
import { Agent } from "undici";
import type { Scope } from "effect";
import { harnessHeader } from "../../../identities/index.ts";

interface ForwardingProxy {
  readonly url: string;
  readonly forwarded: Effect.Effect<readonly string[]>;
  readonly authorizations: Effect.Effect<readonly string[]>;
}

interface ForwardingProxyOptions {
  readonly target: string;
  readonly addsToken?: string;
}

const FORWARDED = new Set(["accept", "authorization", "content-type", harnessHeader]);
const LISTEN = { host: "127.0.0.1", port: 0 } as const;

function isForwarded(_value: string, name: string): boolean {
  return FORWARDED.has(name);
}

function headersToSend(
  headers: Readonly<Record<string, string>>,
  { addsToken = "" }: ForwardingProxyOptions,
): Readonly<Record<string, string>> {
  const forwarded = Record.filter(headers, isForwarded);
  if (addsToken === "") {
    return forwarded;
  }
  return { ...forwarded, authorization: `Bearer ${addsToken}` };
}

function forwardingProxy(options: ForwardingProxyOptions): Effect.Effect<ForwardingProxy, never, Scope.Scope> {
  const { target } = options;
  return Effect.gen(function* startForwardingProxy() {
    const seen = yield* Ref.make<readonly string[]>([]);
    const authorizations = yield* Ref.make<readonly string[]>([]);
    const direct = yield* Effect.sync(() => new Agent());
    yield* Effect.addFinalizer(() => Effect.promise(() => direct.close()));
    const forward = Effect.gen(function* forwardRequest() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const { pathname, search } = new URL(request.url, target);
      yield* Ref.update(seen, (all) => [...all, `${request.method} ${pathname}`]);
      yield* Ref.update(authorizations, (all) => [...all, request.headers["authorization"] ?? ""]);
      const text = yield* request.text;
      const answered = yield* Effect.promise(() =>
        direct.request({
          body: text,
          headers: headersToSend(request.headers, options),
          method: request.method,
          origin: target,
          path: `${pathname}${search}`,
        }),
      );
      const body = yield* Effect.promise(() => answered.body.text());
      return HttpServerResponse.text(body, {
        contentType: String(answered.headers["content-type"]),
        status: answered.statusCode,
      });
    }).pipe(Effect.orDie);
    const serving = HttpServer.serve(forward).pipe(Layer.provideMerge(nodeHttpServer(LISTEN)));
    const server = yield* Effect.orDie(Layer.build(serving));
    const url = yield* Effect.provideContext(serverUrl, server);
    return { authorizations: Ref.get(authorizations), forwarded: Ref.get(seen), url };
  });
}

export { type ForwardingProxy, type ForwardingProxyOptions, forwardingProxy };

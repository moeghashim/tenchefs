import { Deferred, Effect, Layer } from "effect";
import { HttpServer, HttpServerResponse } from "effect/http";
import { nodeHttpServer, serverUrl } from "../../../http/server.ts";
import type { Scope } from "effect";

interface SilentServer {
  readonly url: string;
  readonly asked: Effect.Effect<void>;
}

const LISTEN = { host: "127.0.0.1", port: 0 } as const;
const UNAVAILABLE = 503;

function silentServer(): Effect.Effect<SilentServer, never, Scope.Scope> {
  return Effect.gen(function* startSilentServer() {
    const asked = yield* Deferred.make<boolean>();
    const released = yield* Deferred.make<boolean>();
    const answerOnceReleased = Deferred.succeed(asked, true).pipe(
      Effect.andThen(Deferred.await(released)),
      Effect.as(HttpServerResponse.empty({ status: UNAVAILABLE })),
    );
    const serving = HttpServer.serve(answerOnceReleased).pipe(Layer.provideMerge(nodeHttpServer(LISTEN)));
    const server = yield* Layer.build(serving);
    yield* Effect.addFinalizer(() => Deferred.succeed(released, true));
    const url = yield* Effect.provideContext(serverUrl, server);
    return { asked: Effect.asVoid(Deferred.await(asked)), url };
  }).pipe(Effect.orDie);
}

export { type SilentServer, silentServer };

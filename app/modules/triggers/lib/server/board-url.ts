import { Context, Deferred, Effect, Layer } from "effect";

interface BoardUrlService {
  readonly url: Effect.Effect<string>;
  readonly served: (address: string) => Effect.Effect<void>;
}

class BoardUrl extends Context.Service<BoardUrl, BoardUrlService>()(
  "@ai-hero/cookout/triggers/lib/server/board-url/BoardUrl",
) {}

function boardUrlLayer(publicUrl: string): Layer.Layer<BoardUrl> {
  return Layer.effect(
    BoardUrl,
    Effect.gen(function* makeBoardUrl() {
      const address = yield* Deferred.make<string>();
      function served(at: string): Effect.Effect<void> {
        return Effect.asVoid(Deferred.succeed(address, at));
      }
      if (publicUrl === "") {
        return BoardUrl.of({ served, url: Deferred.await(address) });
      }
      return BoardUrl.of({ served, url: Effect.succeed(publicUrl) });
    }),
  );
}

export { BoardUrl, boardUrlLayer };

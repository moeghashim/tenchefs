import { Array as Arr, Effect, FileSystem } from "effect";
import type { ProxyOptions } from "vite";
import type { Scope } from "effect";
import { contentSecurityPolicy } from "../../../http/server.ts";
import { createServer } from "vite";
import { probePlugins } from "../../../probe/server.ts";

const LOCAL = "127.0.0.1";
const FREE_PORT = 0;

function cookoutProxy(cookoutUrl: string): ProxyOptions {
  return { changeOrigin: true, headers: { origin: cookoutUrl }, target: cookoutUrl };
}

interface ViteDevServer {
  readonly cookoutUrl: string;
  readonly probe: boolean;
}

function viteDevServer({
  cookoutUrl,
  probe,
}: ViteDevServer): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> {
  return Effect.gen(function* startWebDevServer() {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-vite-" }));
    const headers = { "content-security-policy": contentSecurityPolicy };
    const server = {
      headers,
      host: LOCAL,
      port: FREE_PORT,
      proxy: { "/v1": cookoutProxy(cookoutUrl) },
      strictPort: true,
    };
    const vite = yield* Effect.promise(() => createServer({ cacheDir, plugins: probePlugins(probe), server }));
    yield* Effect.addFinalizer(() => Effect.promise(() => vite.close()));
    yield* Effect.promise(() => vite.listen());
    const resolved = yield* Effect.orDie(Effect.fromNullishOr(vite.resolvedUrls));
    const url = yield* Effect.orDie(Effect.fromOption(Arr.head(resolved.local)));
    return new URL(url).origin;
  }).pipe(Effect.uninterruptible);
}

export { viteDevServer };

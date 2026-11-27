import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { builtWebFolder, commandLineServices, startDevServing } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

interface Fetched {
  readonly policy: string | undefined;
  readonly text: string;
}

function fetched(url: string): Effect.Effect<Fetched> {
  return Effect.gen(function* fetchText() {
    const response = yield* HttpClient.execute(HttpClientRequest.get(url));
    const text = yield* response.text;
    return { policy: response.headers["content-security-policy"], text };
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);
}

it.effect("pnpm dev start --web serves that built web UI from the cookout itself, as serve does", () =>
  Effect.gen(function* devServesABuiltWebUi() {
    const web = yield* builtWebFolder;
    const dev = yield* startDevServing(web.folder);
    const [page, script, health, relayed] = yield* Effect.all(
      [
        fetched(dev.webUrl),
        fetched(`${dev.webUrl}${web.scriptPath}`),
        fetched(`${dev.webUrl}/v1/health`),
        fetched(dev.relayUrl),
      ],
      { concurrency: "unbounded" },
    );

    expect(dev.webUrl).toBe(dev.url);
    expect([page.text, script.text, relayed.text]).toStrictEqual([web.indexHtml, web.scriptText, web.indexHtml]);
    expect(health.text).toContain('"status":"ok"');
    expect(page.policy).toBe(health.policy);
  }).pipe(Effect.provide(commandLineServices)),
);

import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import { Effect, pipe } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const PAGE_OF_ONE = 1;
const EXIT_FAILURE = 1;

const annPostsTwice = Effect.gen(function* annPosts() {
  const cookout = yield* TestCookout;
  const ann = yield* cookout.createIdentity("ann");
  const folder = yield* freshStateFolder;
  yield* answer(() => ann.client.createChannel({ name: "grill" }));
  yield* answer(() => ann.client.createMessage({ channel: "grill", text: "the deploy freeze" }));
  yield* answer(() => ann.client.createMessage({ channel: "grill", text: "deployed after the freeze" }));
  const env: Readonly<Record<string, string>> = {
    COOKOUT_STATE_DIR: folder,
    COOKOUT_TOKEN: ann.token,
    COOKOUT_URL: cookout.url,
  };
  return { ann, env };
});

function runAll(
  env: Readonly<Record<string, string>>,
  commandLines: readonly (readonly string[])[],
): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(
    commandLines,
    Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
  );
}

it.effect("cookout search prints the answer as JSON, and pages with --limit and --cursor", () =>
  Effect.gen(function* searchPrints() {
    const { ann, env } = yield* annPostsTwice;
    const all = yield* answer(() => ann.client.search({ query: "deploy freeze" }));
    const first = yield* answer(() => ann.client.search({ limit: PAGE_OF_ONE, query: "deploy freeze" }));
    const rest = yield* answer(() => ann.client.search({ cursor: String(first.cursor), query: "deploy freeze" }));
    const results = yield* runAll(env, [
      ["search", "deploy freeze"],
      ["search", "deploy freeze", "--limit", String(PAGE_OF_ONE)],
      ["search", "deploy freeze", "--cursor", String(first.cursor)],
    ]);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: all },
      { exitCode: 0, stdoutJson: first },
      { exitCode: 0, stdoutJson: rest },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout search with no words prints the refusal on stderr and exits 1", () =>
  Effect.gen(function* searchRefused() {
    const { env } = yield* annPostsTwice;
    const refused = yield* runCookout({ args: ["search", "** #"], env });

    expect(refused).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "empty_query" } },
      stdout: "",
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout search takes filters in the query, and prints a refused filter on stderr", () =>
  Effect.gen(function* searchFilters() {
    const { ann, env } = yield* annPostsTwice;
    const filtered = yield* answer(() => ann.client.search({ query: "from:@ann in:#grill deployed" }));
    const results = yield* runAll(env, [
      ["search", "from:@ann in:#grill deployed"],
      ["search", "freeze from:@nobody"],
    ]);

    expect(filtered.results).toMatchObject([{ message: { text: "deployed after the freeze" } }]);
    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: filtered },
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "unknown_identity" } }, stdout: "" },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

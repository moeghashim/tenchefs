import { commandLineServices, interruptCookout, silentServer, testSecretsKey } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const SERVE_ADMIN_TOKEN = "test-admin-token-0123456789abcdef0123456789";
const ANY_FREE_PORT = "0";

it.effect(
  "a command interrupted while it waits for the server prints interrupted on stderr, nothing on stdout, and exits 1",
  () =>
    Effect.gen(function* interruptedPost() {
      const server = yield* silentServer();
      const stopped = yield* interruptCookout({
        args: ["message", "post", "grill", "done", "--reply-to", "1", "--close"],
        asked: server.asked,
        env: { COOKOUT_TOKEN: "cookout_x", COOKOUT_URL: server.url },
      });

      expect(stopped).toMatchObject({
        exitCode: EXIT_FAILURE,
        stderrJson: { error: { code: "interrupted" } },
        stdout: "",
      });
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout serve interrupted, as SIGTERM stops it, exits 0 and prints no error", () =>
  Effect.gen(function* interruptedServe() {
    const stopped = yield* interruptCookout({
      args: ["serve", "--port", ANY_FREE_PORT, "--host", "127.0.0.1"],
      asked: TestClock.withLive(Effect.sleep("200 millis")),
      env: { COOKOUT_ADMIN_TOKEN: SERVE_ADMIN_TOKEN, COOKOUT_SECRETS_KEY: testSecretsKey },
    });

    expect(stopped.exitCode).toBe(EXIT_SUCCESS);
    expect(stopped.stdout).not.toContain("interrupted");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a command that ends before a signal arrives keeps its own exit code and output", () =>
  Effect.gen(function* endedFirst() {
    const settled = TestClock.withLive(Effect.sleep("200 millis"));
    const finished = yield* interruptCookout({ args: ["--version"], asked: settled, env: {} });
    const refused = yield* interruptCookout({
      args: ["message", "post", "grill", "done", "--close"],
      asked: settled,
      env: { COOKOUT_TOKEN: "cookout_x", COOKOUT_URL: "http://127.0.0.1:1/" },
    });

    expect(finished).toMatchObject({ exitCode: EXIT_SUCCESS, stderr: "" });
    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } }, stdout: "" });
  }).pipe(Effect.provide(commandLineServices)),
);

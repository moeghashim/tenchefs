import { Array as Arr, Effect, FileSystem, Option, String as Str } from "effect";
import { TestCookout, answer, commandLineServices, runCookoutWhile, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isUserCode } from "../../../logins/index.ts";

const POLL_SECONDS = 2;

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

it.effect("login waits out a rate-limited collect instead of failing, and then logs in", () =>
  Effect.gen(function* rateLimitedCollect() {
    const cookout = yield* TestCookout;
    const fs = yield* FileSystem.FileSystem;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" }));

    const login = yield* runCookoutWhile({
      args: ["login"],
      env: { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: folder },
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => answer(() => ada.client.approveLogin(codeIn(prompt))),
    });

    expect(login).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ada" }, url: cookout.url } });
  }).pipe(Effect.provide([testCookout({ noTokenRequestsPerMinute: 1 }), commandLineServices])),
);

import type { CliResult, CommandLineNeeds, TestCookoutService } from "../../../testing/server.ts";
import { Effect, FileSystem, Path, pipe } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { avatarPng, hillsPng } from "../../../testing/index.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const FAILED = 1;
const OVER_MAXIMUM_BYTES = 2_000_001;

interface Desk {
  readonly env: Readonly<Record<string, string>>;
  readonly folder: string;
}

function desk(cookout: TestCookoutService): Effect.Effect<Desk, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* deskWithImages() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const folder = yield* freshStateFolder;
    yield* Effect.orDie(fs.writeFile(path.join(folder, "me.png"), avatarPng()));
    yield* Effect.orDie(fs.writeFile(path.join(folder, "hills.png"), hillsPng()));
    yield* Effect.orDie(fs.writeFileString(path.join(folder, "big.png"), ""));
    yield* Effect.orDie(fs.truncate(path.join(folder, "big.png"), OVER_MAXIMUM_BYTES));
    return { env: { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bot.token, COOKOUT_URL: cookout.url }, folder };
  });
}

function runAll(
  env: Readonly<Record<string, string>>,
  commandLines: readonly (readonly string[])[],
): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(
    commandLines,
    Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
  );
}

it.effect("cookout avatar set sets the caller's own avatar and prints one line naming it", () =>
  Effect.gen(function* setOwn() {
    const cookout = yield* TestCookout;
    const { env, folder } = yield* desk(cookout);
    const [set] = yield* runAll(env, [["avatar", "set", `${folder}/me.png`]]);
    const { identity } = yield* answer(() => cookout.client.getIdentity("todo-bot"));

    expect(set).toMatchObject({
      exitCode: 0,
      stdoutJson: { avatar: identity.avatar, identity: "todo-bot" },
    });
    expect(identity).toHaveProperty("avatar.id", expect.any(String));
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "cookout avatar set refuses a missing file and one over 2 MB before sending, and passes on the server's",
  () =>
    Effect.gen(function* refusedLocally() {
      const cookout = yield* TestCookout;
      const { env, folder } = yield* desk(cookout);
      const results = yield* runAll(env, [
        ["avatar", "set", `${folder}/nope.png`],
        ["avatar", "set", `${folder}/big.png`],
        ["avatar", "set", `${folder}/hills.png`],
      ]);
      const { identity } = yield* answer(() => cookout.client.getIdentity("todo-bot"));

      expect(results).toMatchObject([
        { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "avatar_too_large" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "avatar_wrong_size" } } },
      ]);
      expect(identity).not.toHaveProperty("avatar");
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

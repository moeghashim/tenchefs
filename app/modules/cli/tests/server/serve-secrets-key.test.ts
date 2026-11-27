import { Array as Arr, Effect, FileSystem, Path, String as Str } from "effect";
import {
  answer,
  commandLineServices,
  freshDatabasePath,
  otherSecretsKey,
  runServe,
  startServe,
} from "../../../testing/server.ts";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";

const EXIT_FAILURE = 1;
const SHORT_KEY = "hunter2-but-longer";
const TRIGGER_TOKEN = "routine-token-5d2a-at-rest";
const HEADER_VALUE = "header-secret-7e10-at-rest";
const HEADERS = [{ name: "x-routine-key", value: HEADER_VALUE }];

function plaintextNextTo(database: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* readStoredFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.dirname(database);
    const entries = yield* fs.readDirectory(folder, { recursive: true });
    const files = yield* Effect.filter(entries, (entry) =>
      Effect.map(fs.stat(path.join(folder, entry)), (info) => info.type === "File"),
    );
    const contents = yield* Effect.forEach(files, (file) => fs.readFileString(path.join(folder, file), "latin1"), {
      concurrency: 1,
    });
    const text = Arr.join(contents, "\n");
    return Arr.filter([TRIGGER_TOKEN, HEADER_VALUE], (secret) => Str.includes(secret)(text));
  }).pipe(Effect.orDie);
}

function boardWithTrigger(database: string): Effect.Effect<void> {
  return Effect.scoped(
    Effect.gen(function* setTriggerAndStop() {
      const board = yield* startServe({ database });
      const admin = testClient({ env: {}, token: board.adminToken, url: board.url });
      yield* answer(() => createTestAgent({ by: admin, displayName: "triage", name: "triage" }));
      yield* answer(() =>
        admin.setTrigger("triage", { headers: HEADERS, token: TRIGGER_TOKEN, url: "https://routines.test/fire" }),
      );
      yield* board.stop;
    }),
  ).pipe(Effect.provide([NodeServices.layer, secretsLive]));
}

it.effect("cookout serve refuses to start without COOKOUT_SECRETS_KEY and says how to make one", () =>
  Effect.gen(function* refusesWithoutSecretsKey() {
    const database = yield* freshDatabasePath;
    const refused = yield* runServe({ database, env: { COOKOUT_SECRETS_KEY: "" } });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toMatchObject({ error: { code: "secrets_key_invalid" } });
    expect(refused.stderr).toContain("COOKOUT_SECRETS_KEY must be set");
    expect(refused.stderr).toContain("openssl rand -hex 32");
  }).pipe(Effect.provide([NodeServices.layer, commandLineServices])),
);

it.effect("cookout serve refuses a COOKOUT_SECRETS_KEY that isn't 32 bytes without showing it", () =>
  Effect.gen(function* refusesShortSecretsKey() {
    const database = yield* freshDatabasePath;
    const refused = yield* runServe({ database, env: { COOKOUT_SECRETS_KEY: SHORT_KEY } });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toMatchObject({ error: { code: "secrets_key_invalid" } });
    expect(refused.stderr).not.toContain(SHORT_KEY);
  }).pipe(Effect.provide([NodeServices.layer, commandLineServices])),
);

it.effect(
  "a board keeps a trigger's token and header values sealed on disk, and refuses to restart with a different COOKOUT_SECRETS_KEY",
  () =>
    Effect.gen(function* refusesOtherSecretsKey() {
      const database = yield* freshDatabasePath;
      yield* boardWithTrigger(database);
      const left = yield* plaintextNextTo(database);
      const refused = yield* runServe({ database, env: { COOKOUT_SECRETS_KEY: otherSecretsKey } });

      expect(left).toStrictEqual([]);
      expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
      expect(refused.stderrJson).toMatchObject({ error: { code: "secrets_key_mismatch" } });
      expect(refused.stderr).toContain("COOKOUT_SECRETS_KEY");
      expect(refused.stderr).not.toContain(otherSecretsKey);
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

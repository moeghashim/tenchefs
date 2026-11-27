import { Array as Arr, Effect, FileSystem, Path } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import type { TestCookoutService } from "../../../testing/server.ts";

interface SchemaFile {
  readonly file: string;
  readonly folder: string;
}

const schema = { properties: { branch: { type: "string" } }, type: "object" };
const schemaText = '{"properties":{"branch":{"type":"string"}},"type":"object"}';
const url = "https://hooks.example.com/deploy";

const schemaFile: Effect.Effect<SchemaFile, never, FileSystem.FileSystem | Path.Path | Scope.Scope> = Effect.gen(
  function* writeSchemaFile() {
    const folder = yield* freshStateFolder;
    const fs = yield* FileSystem.FileSystem;
    const file = (yield* Path.Path).join(folder, "deploy.schema.json");
    yield* Effect.orDie(fs.writeFileString(file, schemaText));
    return { file, folder };
  },
);

const callDeploy = ["command", "call", "deploy", "--channel", "grill", "--data"];

function deployInGrill(
  cookout: TestCookoutService,
): Effect.Effect<Readonly<Record<string, string>>, never, FileSystem.FileSystem | Path.Path | Scope.Scope> {
  return Effect.gen(function* addDeployAndGrill() {
    const folder = yield* freshStateFolder;
    const required = { ...schema, required: ["branch"] };
    yield* answer(() =>
      cookout.client.addCommand({ name: "deploy", schema: required, url: `${cookout.webhook.url}/deploy` }),
    );
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    return { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
  });
}

it.effect("cookout command add reads the schema file and prints the secret once; cookout command list shows it", () =>
  Effect.gen(function* addAndList() {
    const cookout = yield* TestCookout;
    const { file, folder } = yield* schemaFile;
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const added = yield* runCookout({
      args: ["command", "add", "deploy", "--url", url, "--schema", file, "--description", "Ship it"],
      env,
    });
    yield* runCookout({ args: ["command", "add", "release", "--url", url, "--schema", file], env });
    const listed = yield* runCookout({ args: ["command", "list"], env });
    const command = { description: "Ship it", handler: "deploy", name: "deploy", schema, url };
    const release = { handler: "release", name: "release", schema, url };

    expect(added).toMatchObject({ exitCode: 0, stdoutJson: { command, secret: "hmac_test_2" } });
    expect(listed).toMatchObject({
      exitCode: 0,
      stdoutJson: { commands: [command, release] },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "cookout command call reads --data as JSON and prints the call's thread; data that breaks the schema exits 1",
  () =>
    Effect.gen(function* callFromTheCommandLine() {
      const cookout = yield* TestCookout;
      const env = yield* deployInGrill(cookout);
      const called = yield* runCookout({ args: [...callDeploy, '{"branch":"main"}'], env });
      const refused = yield* runCookout({ args: [...callDeploy, '{"branch":1}'], env });
      const { messages } = yield* answer(() => cookout.client.listMessages("grill"));

      expect(messages).toMatchObject([{ data: { command: "deploy", data: { branch: "main" } } }]);
      expect(called).toMatchObject({ exitCode: 0 });
      expect([called.stdoutJson]).toStrictEqual(Arr.map(messages, ({ id }) => ({ messageId: id, threadId: id })));
      expect(refused).toMatchObject({
        exitCode: 1,
        stderrJson: { error: { code: "invalid_request", details: [{ path: ["data", "branch"] }] } },
      });
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "cookout command rotate prints the Webhook command with its new secret; an unknown Webhook command exits 1",
  () =>
    Effect.gen(function* rotateFromTheCommandLine() {
      const cookout = yield* TestCookout;
      const env = yield* deployInGrill(cookout);
      const rotated = yield* runCookout({ args: ["command", "rotate", "deploy"], env });
      const missing = yield* runCookout({ args: ["command", "rotate", "release"], env });

      expect(rotated).toMatchObject({
        exitCode: 0,
        stdoutJson: { command: { name: "deploy" }, secret: "hmac_test_3" },
      });
      expect(missing).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "command_not_found" } } });
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout command add with a Command's name exits 1 with the command_exists refusal", () =>
  Effect.gen(function* addCommandName() {
    const cookout = yield* TestCookout;
    const { file, folder } = yield* schemaFile;
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const refused = yield* runCookout({ args: ["command", "add", "schedule", "--url", url, "--schema", file], env });

    expect(refused).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "command_exists" } } });
    expect(refused.stderr).toContain("schedule is a Command's name");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

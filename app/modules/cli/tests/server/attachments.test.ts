import { Array as Arr, Effect, FileSystem, Option, Path, String as Str, pipe } from "effect";
import type { CliResult, CommandLineNeeds, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
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

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const FAILED = 1;
const OVER_MAXIMUM_BYTES = 10_000_001;
const NOTES = "the notes";
const LOG = "a log line";

interface Desk {
  readonly ann: TestIdentity;
  readonly env: Readonly<Record<string, string>>;
  readonly folder: string;
}

function desk(cookout: TestCookoutService): Effect.Effect<Desk, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* deskWithFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ann = yield* cookout.createIdentity("ann");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    yield* Effect.forEach(
      [
        ["notes.txt", NOTES],
        ["log.txt", LOG],
        ["empty.txt", ""],
        ["big.bin", ""],
      ] as const,
      ([name, text]) => Effect.orDie(fs.writeFileString(path.join(folder, name), text)),
      ONE_AT_A_TIME,
    );
    yield* Effect.orDie(fs.makeDirectory(path.join(folder, "out")));
    yield* Effect.orDie(fs.truncate(path.join(folder, "big.bin"), OVER_MAXIMUM_BYTES));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: ann.token, COOKOUT_URL: cookout.url };
    return { ann, env, folder };
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

it.effect("cookout message post --attach, repeated, posts each file by its base name and in order", () =>
  Effect.gen(function* postWithFiles() {
    const cookout = yield* TestCookout;
    const { env, folder } = yield* desk(cookout);
    const [posted] = yield* runAll(env, [
      ["message", "post", "grill", "files", "--attach", `${folder}/notes.txt`, "--attach", `${folder}/log.txt`],
    ]);

    expect(posted).toMatchObject({
      exitCode: 0,
      stdoutJson: {
        message: { attachments: [{ name: "notes.txt", size: NOTES.length }, { name: "log.txt" }], text: "files" },
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout message post --attach with no text posts the files alone, and with neither it is refused", () =>
  Effect.gen(function* attachmentsOnly() {
    const cookout = yield* TestCookout;
    const { env, folder } = yield* desk(cookout);
    const results = yield* runAll(env, [
      ["message", "post", "grill", "--attach", `${folder}/notes.txt`],
      ["message", "post", "grill", "--reply-to", "1", "--attach", `${folder}/log.txt`],
      ["message", "post", "grill"],
      ["message", "list", "grill"],
      ["thread", "get", "1"],
    ]);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { message: { attachments: [{ name: "notes.txt", size: NOTES.length }], text: "" } } },
      { exitCode: 0, stdoutJson: { message: { attachments: [{ name: "log.txt" }], replyTo: 1, text: "" } } },
      { exitCode: FAILED, stderrJson: { error: { code: "invalid_request" } } },
      { exitCode: 0, stdoutJson: { messages: [{ attachments: [{ name: "notes.txt" }], text: "" }] } },
      {
        exitCode: 0,
        stdoutJson: { parent: { text: "" }, replies: [{ attachments: [{ name: "log.txt" }], text: "" }] },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "cookout message post refuses a missing, empty, unreadable or over-size file and eleven files before sending",
  () =>
    Effect.gen(function* refusedLocally() {
      const cookout = yield* TestCookout;
      const { ann, env, folder } = yield* desk(cookout);
      const eleven = Array.from({ length: 11 }, () => ["--attach", `${folder}/notes.txt`]).flat();
      const results = yield* runAll(env, [
        ["message", "post", "grill", "hi", "--attach", `${folder}/nope.txt`],
        ["message", "post", "grill", "hi", "--attach", `${folder}/empty.txt`],
        ["message", "post", "grill", "hi", ...eleven],
        ["message", "post", "grill", "hi", "--attach", `${folder}/big.bin`],
        ["message", "post", "grill", "hi", "--attach", `${folder}/out`],
      ]);
      const page = yield* answer(() => ann.client.listMessages("grill"));

      expect(results).toMatchObject([
        { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "attachment_empty" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "too_many_attachments" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "attachment_too_large" } } },
        { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
      ]);
      expect(page.messages).toStrictEqual([]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "cookout asset get writes the bytes to -o, prints one line about it, and won't overwrite without --force",
  () =>
    Effect.gen(function* getToFile() {
      const cookout = yield* TestCookout;
      const { ann, env, folder } = yield* desk(cookout);
      const bytes = new TextEncoder().encode(NOTES);
      const { message } = yield* answer(() =>
        ann.client.createMessage({ attachments: [{ bytes, name: "notes.txt" }], channel: "grill", text: "files" }),
      );
      const [id = ""] = Arr.map(message.attachments ?? [], (attachment) => attachment.id);
      const target = `${folder}/copy.txt`;
      const results = yield* runAll(env, [
        ["asset", "get", id, "-o", target],
        ["asset", "get", id, "-o", target],
        ["asset", "get", id, "-o", target, "--force"],
      ]);
      const written = yield* Effect.orDie(Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(target)));

      expect(results).toMatchObject([
        {
          exitCode: 0,
          stdoutJson: {
            contentType: "application/octet-stream",
            id,
            name: "notes.txt",
            path: target,
            size: NOTES.length,
          },
        },
        { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
        { exitCode: 0 },
      ]);
      expect([written, Arr.some(results, ({ stdout }) => Str.includes(NOTES)(stdout))]).toStrictEqual([NOTES, false]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout asset get into a folder keeps only a safe base name: a hostile name can't climb out", () =>
  Effect.gen(function* safeBaseName() {
    const cookout = yield* TestCookout;
    const { ann, env, folder } = yield* desk(cookout);
    const bytes = new TextEncoder().encode(LOG);
    const posted = yield* Effect.forEach(
      ["../../escape.txt", String.raw`..\..\win.txt`, ".."],
      (name) =>
        answer(() => ann.client.createMessage({ attachments: [{ bytes, name }], channel: "grill", text: "files" })),
      ONE_AT_A_TIME,
    );
    const ids = Arr.flatMap(posted, ({ message }) => Arr.map(message.attachments ?? [], (attachment) => attachment.id));
    const out = `${folder}/out`;
    const results = yield* runAll(
      env,
      Arr.map(ids, (id) => ["asset", "get", id, "-o", out]),
    );

    const dots = Option.getOrElse(Arr.last(ids), () => "");

    expect(results).toMatchObject([
      { stdoutJson: { path: `${out}/escape.txt` } },
      { stdoutJson: { path: `${out}/win.txt` } },
      { stdoutJson: { path: `${out}/${dots}` } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout asset get of an unknown ID is refused, and writes nothing", () =>
  Effect.gen(function* unknownAsset() {
    const cookout = yield* TestCookout;
    const { env, folder } = yield* desk(cookout);
    const results = yield* runAll(env, [
      ["asset", "get", "no-such-id", "-o", `${folder}/x`],
      ["asset", "get", "not/an/id", "-o", `${folder}/x`],
    ]);

    expect(results).toMatchObject([
      { exitCode: FAILED, stderrJson: { error: { code: "attachment_not_found" } } },
      { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function inFolder(folder: string): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const before = process.cwd();
      process.chdir(folder);
      return before;
    }),
    (before) =>
      Effect.sync(() => {
        process.chdir(before);
      }),
  );
}

it.effect(
  "cookout asset get with no -o writes the attachment's name in the current folder, and fails on no folder",
  () =>
    Effect.gen(function* getHere() {
      const cookout = yield* TestCookout;
      const { ann, env, folder } = yield* desk(cookout);
      const bytes = new TextEncoder().encode(NOTES);
      const { message } = yield* answer(() =>
        ann.client.createMessage({ attachments: [{ bytes, name: "notes.txt" }], channel: "grill", text: "files" }),
      );
      const [id = ""] = Arr.map(message.attachments ?? [], (attachment) => attachment.id);
      yield* inFolder(`${folder}/out`);
      const results = yield* runAll(env, [
        ["asset", "get", id],
        ["asset", "get", id, "-o", `${folder}/missing/notes.txt`],
      ]);
      const written = yield* Effect.orDie(
        Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(`${folder}/out/notes.txt`)),
      );

      expect(results).toMatchObject([
        { exitCode: 0, stdoutJson: { path: "notes.txt" } },
        { exitCode: FAILED, stderrJson: { error: { code: "usage" } } },
      ]);
      expect(written).toBe(NOTES);
    }).pipe(Effect.scoped, Effect.provide([testCookout(), commandLineServices])),
);

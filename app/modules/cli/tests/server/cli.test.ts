import { Effect, pipe } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  cuttableLink,
  runCookout,
  runCookoutBinary,
  testCookout,
  watchCookoutBinary,
} from "../../../testing/server.ts";
import type { TestIdentity, Watched } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";

const EXIT_FAILURE = 1;
const EXIT_TOKEN = 3;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const TWO_LINES = 2;
const FIRST_TEXT = "@bob have a look";
const SECOND_TEXT = "@bob and this";
const THIRD_TEXT = "@bob and one more";
const THREE_LINES = 3;
const RECONNECT_NOTE = 1;
const verbs: readonly (readonly string[])[] = [
  ["identity", "create", "bot", "--kind", "agent", "--display-name", "Bot"],
  ["identity", "rotate", "bot"],
  ["channel", "create", "grill", "--description", "Grill it"],
  ["channel", "get", "grill"],
  ["message", "post", "grill", "Is the idle expiry 7 days?", "--data", '{"question":1}'],
  ["message", "post", "grill", "Yes.", "--reply-to", "1"],
  ["message", "list", "grill", "--limit", "1", "--before", "2"],
  ["thread", "get", "2"],
  ["identity", "deactivate", "bot"],
  ["whoami"],
  ["identity", "list"],
  ["channel", "list"],
  ["channel", "list", "--subscribed"],
  ["message", "list", "grill"],
  ["identity", "create", "loner", "--kind", "human"],
  ["channel", "create", "plain"],
  ["channel", "delete", "plain"],
];

it.effect("every verb passes its arguments and flags to the server and prints the answer as JSON", () =>
  Effect.gen(function* verbsReachTheServer() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const results = yield* pipe(
      verbs,
      Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
    );

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { kind: "agent", name: "bot", owner: "admin" } } },
      { ...succeeded, stdoutJson: { identity: { name: "bot" } } },
      { ...succeeded, stdoutJson: { channel: { description: "Grill it", name: "grill" } } },
      { ...succeeded, stdoutJson: { channel: { name: "grill" } } },
      { ...succeeded, stdoutJson: { message: { data: { question: 1 }, id: 1 } } },
      { ...succeeded, stdoutJson: { message: { id: 2, replyTo: 1 } } },
      { ...succeeded, stdoutJson: { hasMore: false, messages: [{ id: 1 }] } },
      { ...succeeded, stdoutJson: { parent: { id: 1 }, replies: [{ id: 2 }] } },
      { ...succeeded, stdoutJson: { identity: { deactivated: true, name: "bot" } } },
      { ...succeeded, stdoutJson: { identity: { name: "admin" } } },
      { ...succeeded, stdoutJson: { identities: [{ kind: "human", name: "admin" }] } },
      { ...succeeded, stdoutJson: { channels: [{ name: "grill" }] } },
      { ...succeeded, stdoutJson: { channels: [{ name: "grill" }] } },
      { ...succeeded, stdoutJson: { messages: [{ id: 1 }] } },
      { ...succeeded, stdoutJson: { identity: { kind: "human", name: "loner" } } },
      { ...succeeded, stdoutJson: { channel: { name: "plain" } } },
      { ...succeeded, stdoutJson: { channel: { name: "plain" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a refusal is JSON on stderr, with its status, and exit code 1", () =>
  Effect.gen(function* refusalOnStderr() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const gone = yield* runCookout({ args: ["identity", "deactivate", "nobody"], env });

    expect(gone).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "identity_not_found", status: 404 } },
      stdout: "",
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity create needs --kind human or agent, and identity list shows each kind", () =>
  Effect.gen(function* createNeedsKind() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const noKind = yield* runCookout({ args: ["identity", "create", "bot"], env });
    const badKind = yield* runCookout({ args: ["identity", "create", "bot", "--kind", "robot"], env });
    yield* runCookout({ args: ["identity", "create", "ada", "--kind", "human"], env });
    yield* runCookout({ args: ["identity", "create", "bot", "--kind=agent", "--owner=ada", "--display-name=B"], env });
    const listed = yield* runCookout({ args: ["identity", "list"], env });
    const usage = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } };

    expect([noKind, badKind]).toMatchObject([usage, usage]);
    expect(listed).toMatchObject({
      ...succeeded,
      stdoutJson: {
        identities: [
          { kind: "human", name: "ada" },
          { kind: "human", name: "admin" },
          { kind: "agent", name: "bot", owner: "ada" },
        ],
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the CLI refuses --data that isn't JSON with a usage error", () =>
  Effect.gen(function* badData() {
    const result = yield* runCookout({
      args: ["message", "post", "grill", "hi", "--data", "{nope"],
      env: { COOKOUT_URL: "http://127.0.0.1:1" },
    });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the CLI refuses a message ID that isn't a positive whole number with a usage error", () =>
  Effect.gen(function* badMessageId() {
    const result = yield* runCookout({ args: ["thread", "get", "0"], env: { COOKOUT_URL: "http://127.0.0.1:1" } });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the CLI exits 1 with a JSON error on stderr when the token is missing", () =>
  Effect.gen(function* tokenMissing() {
    const cookout = yield* TestCookout;
    const result = yield* runCookoutBinary({ args: ["whoami"], env: { COOKOUT_URL: cookout.url } });

    expect(result).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "token_missing", status: 401 } },
      stdout: "",
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the CLI says so when COOKOUT_URL is not set", () =>
  Effect.gen(function* urlMissing() {
    const result = yield* runCookout({ args: ["whoami"], env: {} });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "url_missing" } } });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the CLI fails with unreachable, as JSON on stderr, when it can't reach the server", () =>
  Effect.gen(function* unreachable() {
    const result = yield* runCookout({ args: ["whoami"], env: { COOKOUT_URL: "http://127.0.0.1:1/" } });

    expect(result).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "unreachable" } },
      stdout: "",
    });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the CLI prints its help and exits 1 when no command is given", () =>
  Effect.gen(function* noCommand() {
    const result = yield* runCookout({ args: [], env: {} });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE });
    expect(result.stdout).toContain("identity");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the CLI refuses an unknown command with a usage error", () =>
  Effect.gen(function* unknownCommand() {
    const result = yield* runCookout({ args: ["identity", "explode"], env: { COOKOUT_URL: "http://127.0.0.1:1" } });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } });
  }).pipe(Effect.provide(commandLineServices)),
);

function mention(ann: TestIdentity, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => ann.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

function watchTwoMentions(
  args: readonly string[],
): Effect.Effect<Watched<readonly [MessageId, MessageId]>, never, Scope.Scope> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const mentions = Effect.all([mention(ann, FIRST_TEXT), mention(ann, SECOND_TEXT)], ONE_AT_A_TIME);
    return yield* watchCookoutBinary({
      args,
      env: { COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url },
      lines: TWO_LINES,
      whileWatching: mentions,
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices]));
}

it.effect("the cookout watch process prints one text line per new inbox item to stdout, and nothing else", () =>
  Effect.gen(function* watchText() {
    const {
      during: [first, second],
      stdoutLines,
    } = yield* watchTwoMentions(["watch"]);

    expect(stdoutLines).toStrictEqual([
      `#grill thread:${String(first)} @ann: ${FIRST_TEXT} (msg ${String(first)})`,
      `#grill thread:${String(second)} @ann: ${SECOND_TEXT} (msg ${String(second)})`,
    ]);
  }),
);

it.effect("the cookout watch --json process prints one JSON line per new inbox item to stdout, and nothing else", () =>
  Effect.gen(function* watchJson() {
    const {
      during: [first, second],
      stdoutJson,
    } = yield* watchTwoMentions(["watch", "--json"]);

    expect(stdoutJson).toMatchObject([
      { item: { message: { id: first, text: FIRST_TEXT }, reasons: ["mention"] }, type: "inbox-item" },
      { item: { message: { id: second, text: SECOND_TEXT } }, type: "inbox-item" },
    ]);
  }),
);

it.effect("cookout serve refuses a COOKOUT_PUBLIC_URL that isn't a URL before it listens", () =>
  Effect.gen(function* refusesBadPublicUrl() {
    const refused = yield* runCookout({
      args: ["serve", "--port", "0", "--host", "127.0.0.1"],
      env: { COOKOUT_PUBLIC_URL: "cookout.fly.dev" },
    });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderr).toContain("COOKOUT_PUBLIC_URL must be empty or a URL");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the cookout watch process exits with its exit code, 3 with one stdout line for an unknown token", () =>
  Effect.gen(function* watchExitCode() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_TOKEN: "cookout_x", COOKOUT_URL: cookout.url };
    const unknown = yield* runCookoutBinary({ args: ["watch", "--json"], env });

    expect(unknown).toMatchObject({ exitCode: EXIT_TOKEN, stdoutJson: { error: { code: "token_unknown" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function watchThroughADrop(): Effect.Effect<Watched<readonly [MessageId, MessageId, MessageId]>, never, Scope.Scope> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const link = yield* cuttableLink(cookout.url);
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const throughADrop = Effect.gen(function* postAcrossADrop() {
      const before = yield* mention(ann, FIRST_TEXT);
      yield* link.relayed(`id: ${String(before)}\n`);
      yield* link.cut;
      const whileCut = yield* mention(ann, SECOND_TEXT);
      const after = yield* mention(ann, THIRD_TEXT);
      return [before, whileCut, after] as const;
    });
    return yield* watchCookoutBinary({
      args: ["watch"],
      env: { COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url },
      lines: THREE_LINES,
      whileWatching: throughADrop,
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices]));
}

it.effect("the cookout watch process reconnects after a drop with each item once on stdout, noting it on stderr", () =>
  Effect.gen(function* watchAcrossADrop() {
    const {
      during: [before, whileCut, after],
      stderrLines,
      stdoutLines,
    } = yield* watchThroughADrop();

    expect(stdoutLines).toStrictEqual([
      `#grill thread:${String(before)} @ann: ${FIRST_TEXT} (msg ${String(before)})`,
      `#grill thread:${String(whileCut)} @ann: ${SECOND_TEXT} (msg ${String(whileCut)})`,
      `#grill thread:${String(after)} @ann: ${THIRD_TEXT} (msg ${String(after)})`,
    ]);
    expect(stderrLines[RECONNECT_NOTE]).toMatch(/^\{"reconnecting":/u);
  }),
);

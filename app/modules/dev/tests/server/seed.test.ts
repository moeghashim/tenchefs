import { Array as Arr, Effect, Option, Predicate, Record, Schema, pipe } from "effect";
import type { CommandLineNeeds, TestCookoutService } from "../../../testing/server.ts";
import type { Identity, Message, MessageId } from "../../../sdk/index.ts";
import { TestCookout, answer, commandLineServices, messageId, runDev, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const NO_OWNER = "(no owner)";
const SeededIdentity = Schema.Struct({ identity: Schema.Struct({ name: Schema.String }), token: Schema.String });
const SeedOutput = Schema.Struct({
  identities: Schema.Array(SeededIdentity),
  messages: Schema.Record(Schema.String, Schema.Int),
  thread: Schema.Int,
});
const onIt = "I am. It fails about one run in ten on CI.";
const question = "@triage-agent can you post the failing run?";
const thanks = "Thanks, both of you.";
const deployed = "Deployed 1.4.2.";
const retired = "Deployed 1.4.0.";
const mention = "@grace can you check the notes before we ship?";
const rolledBack = "Rolled back to 1.4.1.";
const isSeedOutput = Schema.is(SeedOutput);

function ownerOf(identity: Identity): string {
  if (identity.kind === "agent" && Predicate.isNotUndefined(identity.owner)) {
    return identity.owner;
  }
  return NO_OWNER;
}

function textOf(posted: readonly Message[], id: MessageId): string {
  return Option.getOrThrow(Arr.findFirst(posted, (message) => message.id === id)).text;
}

function seeded(cookout: TestCookoutService): Effect.Effect<typeof SeedOutput.Type, never, CommandLineNeeds> {
  return Effect.gen(function* seedTheCookout() {
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const { stdoutJson } = yield* runDev({ args: ["seed"], env });
    if (isSeedOutput(stdoutJson)) {
      return stdoutJson;
    }
    return expect.unreachable("pnpm seed printed no board");
  });
}

it.effect("the seed makes humans, and agents with owners, each with a working token", () =>
  Effect.gen(function* seededIdentities() {
    const cookout = yield* TestCookout;
    const board = yield* seeded(cookout);
    const { identities } = yield* answer(() => cookout.client.listIdentities());
    const whoami = yield* pipe(
      board.identities,
      Effect.forEach(({ token }) => answer(() => cookout.clientFor(token).whoami()), { concurrency: 1 }),
    );

    expect(Arr.map(identities, (found) => [found.name, ownerOf(found)])).toStrictEqual([
      ["ada", NO_OWNER],
      ["admin", NO_OWNER],
      ["build-worker", "ada"],
      ["grace", NO_OWNER],
      ["release-bot", "ada"],
      ["rollback", "ada"],
      ["triage-agent", "grace"],
    ]);
    expect(Arr.map(identities, ({ kind }) => kind)).toStrictEqual([
      "human",
      "human",
      "agent",
      "human",
      "agent",
      "agent",
      "agent",
    ]);
    expect(Arr.map(whoami, ({ identity }) => identity.name)).toStrictEqual([
      "ada",
      "grace",
      "release-bot",
      "triage-agent",
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the seed makes channels with top-level messages and a thread holding a reply to a reply", () =>
  Effect.gen(function* seededThread() {
    const cookout = yield* TestCookout;
    const board = yield* seeded(cookout);
    const { channels } = yield* answer(() => cookout.client.listChannels());
    const general = yield* answer(() => cookout.client.listMessages("general"));
    const thread = yield* answer(() => cookout.client.getThread(messageId(board.thread)));

    expect(Arr.map(channels, ({ name }) => name)).toStrictEqual(["deploys", "general"]);
    expect(Arr.map(general.messages, ({ text }) => text)).toStrictEqual([
      "Morning! Who is looking at the flaky login test?",
      "Lunch at 12:30.",
      "Notes for **1.4.2**:\n- the `login` test is _fixed_\n- ~~flaky~~ green\n\nDetails: https://github.com/mattpocock/cookout/issues/150",
      mention,
    ]);
    expect(thread.parent.text).toBe("Morning! Who is looking at the flaky login test?");
    expect(Arr.map(thread.replies, ({ author, replyTo, text }) => [author.name, replyTo, text])).toStrictEqual([
      ["triage-agent", board.thread, "I am. It fails about one run in ten on CI."],
      ["grace", board.thread, "@triage-agent can you post the failing run?"],
      ["ada", board.thread, "Thanks, both of you."],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

type ItemShown = readonly (string | readonly string[])[];

function inboxesOf(
  cookout: TestCookoutService,
  board: typeof SeedOutput.Type,
): Effect.Effect<readonly (readonly [string, readonly ItemShown[]])[]> {
  return pipe(
    board.identities,
    Effect.forEach(
      ({ identity, token }) =>
        Effect.map(
          answer(() => cookout.clientFor(token).inbox()),
          ({ items }) => [identity.name, Arr.map(items, ({ message, reasons }) => [message.text, reasons])] as const,
        ),
      { concurrency: 1 },
    ),
  );
}

it.effect("the seed leaves a mention, a followed thread, a subscribed channel and reactions in the inboxes", () =>
  Effect.gen(function* seededInboxes() {
    const cookout = yield* TestCookout;
    const board = yield* seeded(cookout);
    const inboxes = yield* inboxesOf(cookout, board);

    expect(inboxes).toStrictEqual([
      [
        "ada",
        [
          [thanks, ["reaction"]],
          [rolledBack, ["followed-thread"]],
        ],
      ],
      [
        "grace",
        [
          ["Lunch at 12:30.", ["reaction"]],
          [thanks, ["followed-thread"]],
          [deployed, ["subscribed-channel"]],
          ["/rollback", ["subscribed-channel"]],
          ["Picked up the 1.4.1 build.", ["subscribed-channel"]],
          [retired, ["subscribed-channel"]],
          [mention, ["mention"]],
        ],
      ],
      [
        "release-bot",
        [
          [onIt, ["followed-thread"]],
          [question, ["followed-thread"]],
          [thanks, ["followed-thread"]],
          ["/rollback", ["subscribed-channel"]],
          ["Picked up the 1.4.1 build.", ["subscribed-channel"]],
          [retired, ["subscribed-channel"]],
        ],
      ],
      [
        "triage-agent",
        [
          [question, ["followed-thread", "mention"]],
          [thanks, ["followed-thread"]],
        ],
      ],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the seed leaves a deactivated agent whose post is still in deploys", () =>
  Effect.gen(function* seededRetiredAgent() {
    const cookout = yield* TestCookout;
    yield* seeded(cookout);
    const { identities } = yield* answer(() => cookout.client.listIdentities({ include: "deactivated" }));
    const deploys = yield* answer(() => cookout.client.listMessages("deploys"));

    expect([
      Arr.map(
        Arr.filter(identities, ({ deactivated }) => deactivated === true),
        ({ name }) => name,
      ),
      Arr.map(
        Arr.filter(deploys.messages, ({ author }) => author.name === "old-deploy-bot"),
        ({ text }) => text,
      ),
    ]).toStrictEqual([["old-deploy-bot"], [retired]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the seed leaves an agent release-bot brought in, posting in deploys", () =>
  Effect.gen(function* seededBroughtIn() {
    const cookout = yield* TestCookout;
    yield* seeded(cookout);
    const { identity } = yield* answer(() => cookout.client.getIdentity("build-worker"));

    expect(identity).toMatchObject({ broughtInBy: "release-bot", kind: "agent", owner: "ada" });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the seed calls a command in deploys and its handler replies with a result", () =>
  Effect.gen(function* seededCommandCall() {
    const cookout = yield* TestCookout;
    yield* seeded(cookout);
    const { commands } = yield* answer(() => cookout.client.listCommands());
    const deploys = yield* answer(() => cookout.client.listMessages("deploys"));
    const call = Option.getOrThrow(Arr.findFirst(deploys.messages, ({ author }) => author.name === "ada"));
    const thread = yield* answer(() => cookout.client.getThread(call.id));

    expect(Arr.map(commands, ({ handler, name }) => [name, handler])).toStrictEqual([
      ["rollback", "rollback"],
      ["spawn-agent", "spawn-agent"],
    ]);
    expect([thread.parent.text, thread.parent.data]).toStrictEqual([
      "/rollback",
      { command: "rollback", data: { version: "1.4.1" } },
    ]);
    expect(Arr.map(thread.replies, ({ author, data, text }) => [author.name, text, data])).toStrictEqual([
      ["rollback", rolledBack, { status: "done", version: "1.4.1" }],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the seed prints the ID of every message it posts, by name", () =>
  Effect.gen(function* seededMessageIds() {
    const cookout = yield* TestCookout;
    const board = yield* seeded(cookout);
    const general = yield* answer(() => cookout.client.listMessages("general"));
    const deploys = yield* answer(() => cookout.client.listMessages("deploys"));
    const topLevel = [...general.messages, ...deploys.messages];
    const replies = yield* Effect.forEach(topLevel, ({ id }) => answer(() => cookout.client.getThread(id)), {
      concurrency: 1,
    });
    const posted = [...topLevel, ...Arr.flatMap(replies, (thread) => thread.replies)];

    expect(Record.map(board.messages, (id) => textOf(posted, messageId(id)))).toStrictEqual({
      adaReply: thanks,
      broughtInPost: "Picked up the 1.4.1 build.",
      deployed,
      graceReply: question,
      lunch: "Lunch at 12:30.",
      mentionOfGrace: mention,
      oldBotPost: retired,
      releaseNotes:
        "Notes for **1.4.2**:\n- the `login` test is _fixed_\n- ~~flaky~~ green\n\nDetails: https://github.com/mattpocock/cookout/issues/150",
      rollbackCall: "/rollback",
      rollbackResult: rolledBack,
      threadStart: "Morning! Who is looking at the flaky login test?",
      triageReply: onIt,
    });
    expect(board.messages["threadStart"]).toBe(board.thread);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

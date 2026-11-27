import { Array as Arr, Effect, String as Str } from "effect";
import type { CommandLineNeeds, CuttableLink, TestIdentity, Watched } from "../../../testing/server.ts";
import type { Message, MessageId } from "../../../messages/index.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  cuttableLink,
  freshStateFolder,
  testCookout,
  watchCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

interface Posted {
  readonly parent: MessageId;
  readonly reply: Message;
}

const ONE_LINE = 1;
const TWO_LINES = 2;
const THREE_LINES = 3;
const A_WHILE = "5 seconds";
const HEARTBEAT_INTERVAL = "15 seconds";
const FIRST_HEARTBEAT = 1;
const AN_HOUR_OF_HEARTBEATS = 240;
const SHOWN = 120;
const LONG = 150;
const LONG_TEXT = `@bob look\n\nat  ${Str.repeat(LONG)("x")}`;

function watchOneReply(args: readonly string[]): Effect.Effect<Watched<Posted>, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message: parent } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "parent" }));
    const ack = answer(() => bob.client.ack(parent.id));
    const reply = answer(() => ann.client.createMessage({ channel: "grill", replyTo: parent.id, text: LONG_TEXT }));
    return yield* watchCookout({
      args,
      env: { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url },
      lines: ONE_LINE,
      whileWatching: Effect.map(Effect.andThen(ack, reply), ({ message }) => ({ parent: parent.id, reply: message })),
    });
  }).pipe(Effect.provide(testCookout()));
}

it.effect(
  "cookout watch prints no line for an ack, and names a reply's thread with its text on one line, cut at 120 characters",
  () =>
    Effect.gen(function* watchText() {
      const {
        during: { parent, reply },
        stdoutLines,
      } = yield* watchOneReply(["watch"]);
      const shown = Str.takeLeft(`@bob look at ${Str.repeat(LONG)("x")}`, SHOWN);

      expect(stdoutLines).toStrictEqual([`#grill thread:${String(parent)} @ann: ${shown} (msg ${String(reply.id)})`]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --json prints the whole event, text untouched", () =>
  Effect.gen(function* watchJson() {
    const {
      during: { reply },
      stdoutJson,
    } = yield* watchOneReply(["watch", "--json"]);

    expect(stdoutJson).toMatchObject([
      { item: { message: reply, reasons: ["followed-thread", "mention"] }, type: "inbox-item" },
    ]);
  }).pipe(Effect.provide(commandLineServices)),
);

const passTime = Effect.forever(Effect.andThen(TestClock.adjust(A_WHILE), Effect.yieldNow));

function mention(ann: TestIdentity, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => ann.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

function postIntoSilence(link: CuttableLink, ann: TestIdentity): Effect.Effect<readonly [MessageId, MessageId]> {
  return Effect.gen(function* stallThenPost() {
    const before = yield* mention(ann, "@bob first");
    yield* link.relayed(`id: ${String(before)}\n`);
    yield* link.stall;
    const unheard = yield* mention(ann, "@bob second");
    yield* Effect.raceFirst(link.relayed(`id: ${String(unheard)}\n`), passTime);
    return [before, unheard] as const;
  });
}

function watchThroughSilence(): Effect.Effect<
  Watched<readonly [MessageId, MessageId]>,
  never,
  CommandLineNeeds | Scope.Scope
> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const link = yield* cuttableLink(cookout.url);
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    return yield* watchCookout({
      args: ["watch", "--json"],
      env: { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url },
      lines: TWO_LINES,
      whileWatching: postIntoSilence(link, ann),
    });
  }).pipe(Effect.provide(testCookout()));
}

it.effect("cookout watch reconnects when the server goes silent, and picks up from the last item it printed", () =>
  Effect.gen(function* watchSilence() {
    const {
      during: [before, unheard],
      stderrLines,
      stdoutJson,
    } = yield* watchThroughSilence();

    expect(stdoutJson).toMatchObject([{ item: { message: { id: before } } }, { item: { message: { id: unheard } } }]);
    expect(stderrLines).toContain(
      '{"reconnecting":"board unavailable (Heard nothing from the server for 45 s.), retrying in 1s"}',
    );
  }).pipe(Effect.provide(commandLineServices)),
);

function heartbeatsAfter(link: CuttableLink, count: number): Effect.Effect<void> {
  return Effect.andThen(TestClock.adjust(HEARTBEAT_INTERVAL), link.relayed(": heartbeat", count));
}

function postAfterHeartbeats(link: CuttableLink, ann: TestIdentity): Effect.Effect<MessageId> {
  const heartbeats = Effect.forEach(
    Arr.range(FIRST_HEARTBEAT, AN_HOUR_OF_HEARTBEATS),
    (count) => heartbeatsAfter(link, count),
    {
      concurrency: 1,
      discard: true,
    },
  );
  return Effect.andThen(heartbeats, mention(ann, "@bob still here"));
}

function watchThroughHeartbeats(): Effect.Effect<Watched<MessageId>, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const link = yield* cuttableLink(cookout.url);
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    return yield* watchCookout({
      args: ["watch", "--json"],
      env: { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url },
      lines: ONE_LINE,
      whileWatching: postAfterHeartbeats(link, ann),
    });
  }).pipe(Effect.provide(testCookout()));
}

it.effect("cookout watch stays on its one connection for an hour of heartbeats with nothing else", () =>
  Effect.gen(function* watchHeartbeats() {
    const { during: posted, stderrLines, stdoutJson } = yield* watchThroughHeartbeats();

    expect(stdoutJson).toMatchObject([{ item: { message: { id: posted } } }]);
    expect(stderrLines).toHaveLength(ONE_LINE);
  }).pipe(Effect.provide(commandLineServices)),
);

function postAcrossADrop(
  link: CuttableLink,
  ann: TestIdentity,
): Effect.Effect<readonly [MessageId, MessageId, MessageId]> {
  return Effect.gen(function* dropThenPost() {
    const before = yield* mention(ann, "@bob before the drop");
    yield* link.relayed(`id: ${String(before)}\n`);
    yield* link.cut;
    const first = yield* mention(ann, "@bob in the gap");
    const second = yield* mention(ann, "@bob in the gap again");
    yield* Effect.raceFirst(link.relayed(`id: ${String(second)}\n`), passTime);
    return [before, first, second] as const;
  });
}

function watchAcrossADrop(): Effect.Effect<
  Watched<readonly [MessageId, MessageId, MessageId]>,
  never,
  CommandLineNeeds | Scope.Scope
> {
  return Effect.gen(function* watchAsBob() {
    const cookout = yield* TestCookout;
    const link = yield* cuttableLink(cookout.url);
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    return yield* watchCookout({
      args: ["watch", "--json"],
      env: { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url },
      lines: THREE_LINES,
      whileWatching: postAcrossADrop(link, ann),
    });
  }).pipe(Effect.provide(testCookout()));
}

it.effect("cookout watch prints each mention posted while its stream was dropped once, after it reconnects", () =>
  Effect.gen(function* watchDrop() {
    const {
      during: [before, first, second],
      stderrLines,
      stdoutJson,
    } = yield* watchAcrossADrop();

    expect(stdoutJson).toMatchObject([
      { item: { message: { id: before } } },
      { item: { message: { id: first } } },
      { item: { message: { id: second } } },
    ]);
    expect(stderrLines).toContain(
      '{"reconnecting":"board unavailable (The server ended the stream.), retrying in 1s"}',
    );
  }).pipe(Effect.provide(commandLineServices)),
);

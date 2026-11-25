import { Array as Arr, Effect, Fiber, Schedule } from "effect";
import type { BinResult, CookoutUnderTestService, Relay, Session, SessionNeeds } from "../../server.ts";
import {
  CookoutUnderTest,
  calledThreadId,
  cookoutUnderTest,
  exampleWebhookCommand,
  openRelay,
  requireExampleWebhookCommand,
  succeeded,
  watchExitTokenRevoked,
  watchLine,
  watchOutput,
} from "../../server.ts";
import type { MessageId, Reply } from "@ai-hero/cookout/sdk";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";

interface Watching {
  readonly cookout: CookoutUnderTestService;
  readonly channel: string;
  readonly caller: Session;
  readonly relay: Relay;
  readonly stopWatching: Effect.Effect<BinResult>;
}

const CONNECTED = "event: connected";
const ITEM = "event: inbox-item";
const ACCEPTED = 202;
const POLL = Schedule.spaced("500 millis");
const RETRIED_WITHIN = 60_000;
const callPath = `/v1/commands/${exampleWebhookCommand}/calls`;
const done = `/${exampleWebhookCommand} is done.`;

const cookoutWithHandler: Effect.Effect<CookoutUnderTestService, never, CookoutUnderTest> = Effect.gen(
  function* checkTheHandler() {
    const cookout = yield* CookoutUnderTest;
    yield* requireExampleWebhookCommand(cookout);
    return cookout;
  },
);

function callerWatching(cookout: CookoutUnderTestService): Effect.Effect<Watching, never, SessionNeeds> {
  return Effect.gen(function* startWatching() {
    const { channel } = yield* cookout.createChannel("calls");
    const relay = yield* openRelay(cookout.url);
    const caller = yield* cookout.joinAgent("caller", relay.url);
    const watch = yield* Effect.forkScoped(caller.cookout("watch"));
    yield* relay.relayed(CONNECTED);
    const stopWatching = cookout
      .deactivateIdentity(caller.name)
      .pipe(Effect.andThen(relay.cut), Effect.andThen(Fiber.join(watch)));
    return { caller, channel: channel.name, cookout, relay, stopWatching };
  });
}

function callExample(session: Session, channel: string, data: string): Effect.Effect<MessageId, never, SessionNeeds> {
  return Effect.gen(function* callFromTheCli() {
    const called = yield* session.cookout(
      "command",
      "call",
      exampleWebhookCommand,
      "--channel",
      channel,
      "--data",
      data,
    );

    expect(called).toMatchObject(succeeded);

    return yield* calledThreadId(called);
  });
}

function calledWhileWatching(watching: Watching): Effect.Effect<MessageId, never, SessionNeeds> {
  return Effect.gen(function* callAndCheckTheAnswer() {
    const { caller, channel, cookout, relay } = watching;
    const thread = yield* callExample(caller, channel, '{"branch":"main"}');
    const answered = yield* relay.answered;
    const { parent } = yield* Effect.promise(() => cookout.admin.getThread(thread));

    expect(answered).toContainEqual({ method: "POST", path: callPath, status: ACCEPTED });
    expect(parent).toMatchObject({
      author: { name: caller.name },
      data: { command: exampleWebhookCommand, data: { branch: "main" } },
      text: `/${exampleWebhookCommand}`,
    });

    return thread;
  });
}

function repliesOnceThere(cookout: CookoutUnderTestService, thread: MessageId): Effect.Effect<readonly Reply[]> {
  return Effect.promise(() => cookout.admin.getThread(thread)).pipe(
    Effect.repeat({ schedule: POLL, until: ({ replies }) => Arr.isReadonlyArrayNonEmpty(replies) }),
    Effect.map(({ replies }) => replies),
  );
}

function lineFor(channel: string, thread: MessageId): (reply: Reply) => string {
  return ({ author, id, text }) => watchLine({ author: author.name, channel, message: id, text, thread });
}

function callAndWatch(): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* watchTheResult() {
    const cookout = yield* cookoutWithHandler;
    const watching = yield* callerWatching(cookout);
    const thread = yield* calledWhileWatching(watching);
    yield* watching.relay.relayed(ITEM);
    const replies = yield* repliesOnceThere(cookout, thread);
    const watched = yield* watching.stopWatching;

    expect(replies).toMatchObject([
      { author: { name: exampleWebhookCommand }, data: { received: { branch: "main" } }, text: done },
    ]);
    expect(watched.exitCode).toBe(watchExitTokenRevoked);
    expect(watchOutput(watched).items).toStrictEqual(Arr.map(replies, lineFor(watching.channel, thread)));
  }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer]));
}

function callFailFirst(): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* waitForTheRetry() {
    const cookout = yield* cookoutWithHandler;
    const { channel } = yield* cookout.createChannel("retried");
    const caller = yield* cookout.joinAgent("caller");
    const thread = yield* callExample(caller, channel.name, '{"branch":"main","failFirst":true}');
    const replies = yield* repliesOnceThere(cookout, thread);

    expect(replies).toMatchObject([
      { author: { name: exampleWebhookCommand }, data: { received: { branch: "main", failFirst: true } }, text: done },
    ]);
  }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer]));
}

it.live(
  "a CLI call to the example Webhook command answers 202 at once with the call message, and the handler's result reply arrives over cookout watch",
  callAndWatch,
);

it.live(
  "a call the example handler fails first is retried with the same call, and its result reply arrives",
  callFailFirst,
  RETRIED_WITHIN,
);

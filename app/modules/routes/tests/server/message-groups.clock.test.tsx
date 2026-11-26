import { DateTime, Effect, pipe } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Message } from "../../../sdk/index.ts";
import { TestClock } from "effect/testing";
import { streamOf } from "../messages.ts";
import { viewOpened } from "../view-opened.ts";

interface People {
  readonly ada: TestIdentity;
  readonly alan: TestIdentity;
  readonly grace: TestIdentity;
}

function people(cookout: TestCookoutService, channel: string): Effect.Effect<People> {
  return Effect.gen(function* createPeople() {
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const alan = yield* cookout.createIdentity("alan", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* answer(() => cookout.client.createChannel({ name: channel }));
    yield* TestClock.adjust("12 hours");
    return { ada, alan, grace };
  });
}

function post(poster: TestIdentity, channel: string, text: string): Effect.Effect<Message> {
  return pipe(
    answer(() => poster.client.createMessage({ channel, text })),
    Effect.map(({ message }) => message),
  );
}

function reply(poster: TestIdentity, parent: Message, text: string): Effect.Effect<Message> {
  return pipe(
    answer(() => poster.client.createMessage({ channel: parent.channel, replyTo: parent.id, text })),
    Effect.map(({ message }) => message),
  );
}

const LOADED_BY = { Messages: "listMessages", Replies: "getThread" } as const;

function shownTo(reader: TestIdentity, hash: string, label: keyof typeof LOADED_BY): Effect.Effect<readonly string[]> {
  return Effect.andThen(
    answer(() => viewOpened({ client: reader.client, hash, waitingOn: [LOADED_BY[label]] })),
    answer(() => streamOf(label)),
  );
}

function threadOf(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

const minuteLater = TestClock.adjust("1 minute");
const ONE_DAY = 86_400_000;

it.effect(
  "messages from one author within 5 minutes sit under one name, and another author or a gap starts a group",
  () =>
    Effect.gen(function* groupsForm() {
      const cookout = yield* TestCookout;
      const { ada, alan, grace } = yield* people(cookout, "groups");
      yield* post(ada, "groups", "one");
      yield* Effect.andThen(minuteLater, post(ada, "groups", "two"));
      yield* Effect.andThen(minuteLater, post(alan, "groups", "three"));
      yield* Effect.andThen(minuteLater, post(alan, "groups", "four"));
      yield* Effect.andThen(TestClock.adjust("6 minutes"), post(alan, "groups", "five"));

      const shown = yield* shownTo(grace, "#/channels/groups", "Messages");

      expect(shown).toStrictEqual(["[Thursday, 1 January]", "adaone", "two", "alanthree", "four", "alanfive"]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("messages on two days are split by a separator naming each day", () =>
  Effect.gen(function* daysSplit() {
    const cookout = yield* TestCookout;
    const { ada, grace } = yield* people(cookout, "days");
    yield* post(ada, "days", "late");
    yield* Effect.andThen(TestClock.adjust("1 day"), post(ada, "days", "next day"));

    const shown = yield* shownTo(grace, "#/channels/days", "Messages");

    expect(shown).toStrictEqual(["[Thursday, 1 January]", "adalate", "[Friday, 2 January]", "adanext day"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a message with replies ends its group, so the next one shows its author again", () =>
  Effect.gen(function* repliesBreak() {
    const cookout = yield* TestCookout;
    const { ada, grace } = yield* people(cookout, "replied");
    const parent = yield* post(ada, "replied", "asked");
    yield* reply(grace, parent, "yes");
    yield* Effect.andThen(minuteLater, post(ada, "replied", "again"));

    const shown = yield* shownTo(grace, "#/channels/replied", "Messages");

    expect(shown).toStrictEqual([
      "[Thursday, 1 January]",
      expect.stringMatching(/^adaasked1 replyLast reply \d{1,2} [A-Z][a-z]{2} \d\d:\d\d/u),
      "adaagain",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the thread panel doesn't repeat the parent's day for replies on it, and groups its replies", () =>
  Effect.gen(function* threadGroups() {
    const cookout = yield* TestCookout;
    const { ada, alan, grace } = yield* people(cookout, "thread-days");
    const parent = yield* post(ada, "thread-days", "asked");
    yield* Effect.andThen(minuteLater, reply(alan, parent, "first"));
    yield* reply(alan, parent, "second");
    yield* Effect.andThen(TestClock.adjust("1 day"), reply(alan, parent, "later"));

    const shown = yield* shownTo(grace, threadOf(parent), "Replies");

    expect(shown).toStrictEqual(["alanfirst", "second", "[Friday, 2 January]", "alanlater"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("messages from yesterday and today are split by Yesterday and Today", () =>
  Effect.gen(function* yesterdayAndToday() {
    const cookout = yield* TestCookout;
    const { ada, grace } = yield* people(cookout, "recent");
    const now = DateTime.toEpochMillis(DateTime.nowUnsafe());
    yield* Effect.andThen(TestClock.setTime(now - ONE_DAY), post(ada, "recent", "before"));
    yield* Effect.andThen(TestClock.setTime(now), post(ada, "recent", "after"));

    const shown = yield* shownTo(grace, "#/channels/recent", "Messages");

    expect(shown).toStrictEqual(["[Yesterday]", "adabefore", "[Today]", "adaafter"]);
  }).pipe(Effect.provide(testCookout())),
);

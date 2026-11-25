import { Array as Arr, Effect, Fiber, Option, String as Str } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, Presence } from "../../index.ts";
import { TestCookout, answer, pastOwnPresence, testCookout, twoSessions } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { openEventStream, request } from "../../../http/client.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { createCookoutClient } from "../../index.ts";
import { eventsPath } from "../../../events/index.ts";
import { sessionPath } from "../../../identities/index.ts";

const BOOT = "2026-01-01T00:00:00.000Z";
const TEN_SECONDS_IN = "2026-01-01T00:00:10.000Z";
const AGENT = "auth-griller";
const ADMIN = "admin";
const HUMAN = { kind: "human" } as const;

type Feed = AsyncIterator<CookoutEvent, unknown>;

type Wait = `${number} seconds` | `${number} minutes`;

interface AroundTheGrace {
  readonly withinGrace: Presence | undefined;
  readonly afterGrace: Presence | undefined;
}

function open(client: CookoutClient, allChannels = false): Effect.Effect<EventStream, never, Scope.Scope> {
  return Effect.acquireRelease(
    answer(() => client.watch({ allChannels })),
    (events) => answer(() => events.close()),
  );
}

function closed(cookout: TestCookoutService, name: string, events: EventStream): Effect.Effect<void> {
  return Effect.andThen(
    answer(() => events.close()),
    cookout.liveConnectionsClosed(name),
  );
}

function webTab(url: string, token: string): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openWebTab() {
    const loggedIn = yield* answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "POST", path: sessionPath }),
    );
    const [setCookie = ""] = loggedIn.headers.getSetCookie();
    const cookie = Arr.headNonEmpty(Str.split("; ")(setCookie));
    const opened = yield* answer(() =>
      openEventStream({ baseUrl: url, headers: { cookie }, method: "GET", path: eventsPath }),
    );
    if (opened.ok) {
      yield* Effect.addFinalizer(() => answer(() => opened.close()));
    }
  });
}

function clientAt(url: string, token: string): CookoutClient {
  return createCookoutClient({ env: {}, token, url });
}

function presenceOf(client: CookoutClient, name: string): Effect.Effect<Presence | undefined> {
  return Effect.map(
    answer(() => client.presence()),
    ({ presence }) => Option.getOrUndefined(Arr.findFirst(presence, ({ identity }) => identity === name)),
  );
}

function aroundTheGrace(client: CookoutClient, name: string): Effect.Effect<AroundTheGrace> {
  return Effect.gen(function* readAroundTheGrace() {
    yield* TestClock.adjust("59 seconds");
    const withinGrace = yield* presenceOf(client, name);
    yield* TestClock.adjust("1 second");
    const afterGrace = yield* presenceOf(client, name);
    return { afterGrace, withinGrace };
  });
}

function feedOf(admin: CookoutClient): Effect.Effect<Feed, never, Scope.Scope> {
  const feed = Effect.map(open(admin, true), (events) => events[Symbol.asyncIterator]());
  return Effect.tap(feed, (events) => pastOwnPresence({ events, name: ADMIN }));
}

function eventIn(next: Readonly<IteratorResult<CookoutEvent, unknown>>): CookoutEvent | null {
  if (next.done === true) {
    return null;
  }
  return next.value;
}

function isPresenceOrEnd(event: CookoutEvent | null): boolean {
  return event === null || event.type === "presence";
}

function nextPresenceEvent(feed: Feed): Effect.Effect<CookoutEvent | null> {
  return answer(() => feed.next()).pipe(Effect.map(eventIn), Effect.repeat({ until: isPresenceOrEnd }));
}

function human(cookout: TestCookoutService, name: string): Effect.Effect<TestIdentity> {
  return cookout.createIdentity(name, HUMAN);
}

function watchedFor(cookout: TestCookoutService, who: TestIdentity, held: Wait): Effect.Effect<void> {
  return Effect.gen(function* watchThenClose() {
    const events = yield* answer(() => who.client.watch());
    yield* TestClock.adjust(held);
    yield* closed(cookout, who.identity.name, events);
  });
}

function presenceAfter(client: CookoutClient, name: string, wait: Wait): Effect.Effect<Presence | undefined> {
  return Effect.andThen(TestClock.adjust(wait), presenceOf(client, name));
}

it.effect("an identity with an open stream reads as online, connected by watch, and offline before it opens one", () =>
  Effect.gen(function* onlineWhileOpen() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    const before = yield* presenceOf(cookout.client, "ann");
    yield* open(ann.client);
    const after = yield* presenceOf(cookout.client, "ann");

    expect(before).toStrictEqual({ identity: "ann", online: false });
    expect(after).toStrictEqual({ connection: { via: "watch" }, identity: "ann", online: true });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the watch stream of an agent joined with a host reports that host", () =>
  Effect.gen(function* watchReportsHost() {
    const cookout = yield* TestCookout;
    const { first } = yield* twoSessions(cookout);
    const issued = yield* answer(() => first.join({ as: AGENT, host: "laptop-1" }));
    yield* open(cookout.clientFor(issued.agentSessionToken));
    const presence = yield* presenceOf(cookout.client, AGENT);

    expect(presence).toStrictEqual({ connection: { host: "laptop-1", via: "watch" }, identity: AGENT, online: true });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a stream sent with the web session cookie connects by web", () =>
  Effect.gen(function* webTabConnects() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    yield* webTab(cookout.url, ann.token);
    const presence = yield* presenceOf(cookout.client, "ann");

    expect(presence).toStrictEqual({ connection: { via: "web" }, identity: "ann", online: true });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("after its only stream closes, an identity stays online for 59 s and reads offline at 60 s", () =>
  Effect.gen(function* graceThenOffline() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    const events = yield* answer(() => ann.client.watch());
    yield* TestClock.adjust("10 seconds");
    yield* closed(cookout, "ann", events);
    const { afterGrace, withinGrace } = yield* aroundTheGrace(cookout.client, "ann");

    expect(withinGrace).toMatchObject({ online: true });
    expect(afterGrace).toStrictEqual({
      identity: "ann",
      lastSeenAt: TEN_SECONDS_IN,
      offlineReason: "connection lost",
      online: false,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a new stream within the grace leaves the identity online, with no presence event for going offline", () =>
  Effect.gen(function* reconnectInGrace() {
    const cookout = yield* TestCookout;
    const [ann, bob] = yield* Effect.all([human(cookout, "ann"), human(cookout, "bob")], { concurrency: 1 });
    const feed = yield* feedOf(cookout.client);
    yield* watchedFor(cookout, ann, "0 seconds");
    yield* TestClock.adjust("30 seconds");
    yield* open(ann.client);
    yield* TestClock.adjust("2 minutes");
    yield* open(bob.client);
    const events = yield* Effect.all([nextPresenceEvent(feed), nextPresenceEvent(feed)], { concurrency: 1 });

    expect(events).toMatchObject([
      { presence: { identity: "ann", online: true } },
      { presence: { identity: "bob", online: true } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human with two streams stays online when one closes, and only the last close starts the grace", () =>
  Effect.gen(function* twoTabs() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    const [firstTab, secondTab] = yield* Effect.all(
      [answer(() => ann.client.watch()), answer(() => ann.client.watch())],
      { concurrency: 1 },
    );
    yield* answer(() => firstTab.close());
    yield* TestClock.adjust("2 minutes");
    const oneOpen = yield* presenceOf(cookout.client, "ann");
    yield* closed(cookout, "ann", secondTab);
    const { afterGrace, withinGrace } = yield* aroundTheGrace(cookout.client, "ann");

    expect([oneOpen, withinGrace]).toMatchObject([{ online: true }, { online: true }]);
    expect(afterGrace).toStrictEqual({
      identity: "ann",
      lastSeenAt: "2026-01-01T00:02:00.000Z",
      offlineReason: "connection lost",
      online: false,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the all-channels feed sends a presence event when an identity goes online and when it goes offline", () =>
  Effect.gen(function* presenceEvents() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    const feed = yield* feedOf(cookout.client);
    const events = yield* answer(() => ann.client.watch());
    const cameOnline = yield* nextPresenceEvent(feed);
    yield* closed(cookout, "ann", events);
    const wentOffline = yield* Effect.forkChild(nextPresenceEvent(feed));
    yield* TestClock.adjust("60 seconds");
    const offline = yield* Fiber.join(wentOffline);

    expect([cameOnline, offline]).toStrictEqual([
      { presence: { connection: { via: "watch" }, identity: "ann", online: true }, type: "presence" },
      {
        presence: { identity: "ann", lastSeenAt: BOOT, offlineReason: "connection lost", online: false },
        type: "presence",
      },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a Deactivated identity is always offline, though its stream is still open", () =>
  Effect.gen(function* deactivatedOffline() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    yield* open(ann.client);
    yield* answer(() => cookout.client.deactivateIdentity("ann"));
    const presence = yield* presenceOf(cookout.client, "ann");

    expect(presence).toStrictEqual({ identity: "ann", lastSeenAt: BOOT, offlineReason: "deactivated", online: false });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "after a restart, an identity that was online reads online during the boot grace and offline at its end",
  () =>
    Effect.gen(function* bootGraceEnds() {
      const cookout = yield* TestCookout;
      const ann = yield* human(cookout, "ann");
      yield* watchedFor(cookout, ann, "10 seconds");
      const admin = yield* cookout.restart;
      const withinBootGrace = yield* presenceAfter(admin, "ann", "4 minutes");
      const afterBootGrace = yield* presenceAfter(admin, "ann", "1 minutes");

      expect([withinBootGrace, afterBootGrace]).toStrictEqual([
        { identity: "ann", online: true },
        { identity: "ann", lastSeenAt: TEN_SECONDS_IN, offlineReason: "connection lost", online: false },
      ]);
    }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("after a restart, an identity that reconnects within the boot grace never shows offline", () =>
  Effect.gen(function* reconnectAfterRestart() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    yield* watchedFor(cookout, ann, "0 seconds");
    const { url } = yield* cookout.restartServer;
    const feed = yield* feedOf(clientAt(url, cookout.adminToken));
    yield* TestClock.adjust("1 minute");
    yield* open(clientAt(url, ann.token));
    const cameBack = yield* nextPresenceEvent(feed);
    const afterBootGrace = yield* presenceAfter(clientAt(url, cookout.adminToken), "ann", "10 minutes");

    expect([cameBack, afterBootGrace]).toMatchObject([
      { presence: { connection: { via: "watch" }, identity: "ann", online: true }, type: "presence" },
      { online: true },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("a deleted identity's last seen is forgotten: a new identity with its name reads as never seen", () =>
  Effect.gen(function* deletedForgotten() {
    const cookout = yield* TestCookout;
    const ann = yield* human(cookout, "ann");
    yield* watchedFor(cookout, ann, "10 seconds");
    yield* TestClock.adjust("60 seconds");
    yield* answer(() => cookout.client.deleteIdentity("ann"));
    yield* human(cookout, "ann");
    const presence = yield* presenceOf(cookout.client, "ann");

    expect(presence).toStrictEqual({ identity: "ann", online: false });
  }).pipe(Effect.provide(testCookout())),
);

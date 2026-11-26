import { Array as Arr, Effect, Option } from "effect";
import type { CookoutClient, DeactivationOffer, DeactivationOfferId, EventStream } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

type Wait = `${number} days` | `${number} millis`;

interface Summary {
  readonly person: string;
  readonly cleared: boolean;
  readonly quietDays: number;
}

const HUMAN = { kind: "human" } as const;
const ADMIN = { admin: true, kind: "human" } as const;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const THIRTY = 30;
const SIXTY = 60;
const NINETY = 90;
const SETTLE = "30 millis";
const JUST_UNDER_THIRTY_DAYS = "2591999999 millis";
const JUST_UNDER_TEN_DAYS = "863999999 millis";
const TEXT = "@bob has had no activity for 30 days. Deactivate them?";

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function quietFor(wait: Wait): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(settled, TestClock.adjust(wait)), settled);
}

function offersAPerson({ identity }: DeactivationOffer): boolean {
  return identity.kind === "human";
}

function personOffers(client: CookoutClient): Effect.Effect<readonly DeactivationOffer[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ deactivationOffers }) => Arr.filter(deactivationOffers, offersAPerson),
  );
}

function offersOnceThere(client: CookoutClient, count: number): Effect.Effect<readonly DeactivationOffer[]> {
  return Effect.repeat(personOffers(client), { until: (offers) => offers.length >= count });
}

function namesIn(offers: readonly DeactivationOffer[]): readonly string[] {
  return Arr.map(offers, ({ identity }) => identity.name);
}

function offerOn(offers: readonly DeactivationOffer[], name: string): DeactivationOfferId {
  const found = Arr.findFirst(offers, ({ identity }) => identity.name === name);
  return Option.getOrThrow(Option.map(found, ({ id }) => id));
}

function summaryOf({ cleared, identity, quietDays }: DeactivationOffer): Summary {
  return { cleared, person: identity.name, quietDays };
}

function offersOnBob(offers: readonly DeactivationOffer[]): readonly Summary[] {
  return Arr.map(
    Arr.filter(offers, ({ identity }) => identity.name === "bob"),
    summaryOf,
  );
}

function history(client: CookoutClient): Effect.Effect<readonly Summary[]> {
  return Effect.map(
    answer(() => client.inboxHistory()),
    ({ deactivationOffers }) => Arr.map(Arr.filter(deactivationOffers, offersAPerson), summaryOf),
  );
}

function stayOnline(who: TestIdentity): Effect.Effect<EventStream, never, Scope.Scope> {
  return Effect.acquireRelease(
    answer(() => who.client.watch()),
    (events) => answer(() => events.close()),
  );
}

const adminsAndBob = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", ADMIN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob, cookout };
});

it.effect("a person quiet for 30 days, with no active agents, raises one offer for each other active admin", () =>
  Effect.gen(function* quietPerson() {
    const { ada, bob, cookout } = yield* adminsAndBob;
    const helper = yield* cookout.createIdentity("bob/helper", { owner: "bob" });
    yield* answer(() => bob.client.deactivateIdentity(helper.identity.name));
    const justUnder = yield* Effect.andThen(quietFor(JUST_UNDER_THIRTY_DAYS), personOffers(ada.client));
    const adas = yield* Effect.andThen(quietFor("1 millis"), offersOnceThere(ada.client, TWO));
    const admins = yield* offersOnceThere(cookout.client, TWO);
    const bobs = yield* personOffers(bob.client);

    expect([justUnder, bobs, namesIn(adas), namesIn(admins)]).toStrictEqual([[], [], ["admin", "bob"], ["ada", "bob"]]);
    expect(offerOn(adas, "bob")).toBe(offerOn(admins, "bob"));
    expect(Arr.filter(adas, ({ identity }) => identity.name === "bob")).toMatchObject([
      { cleared: false, quietDays: 30, text: TEXT },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

const fourOwners = Effect.gen(function* openFourOwners() {
  const cookout = yield* TestCookout;
  function person(name: string): Effect.Effect<TestIdentity> {
    return cookout.createIdentity(name, HUMAN);
  }
  function agent(name: string, owner: string): Effect.Effect<TestIdentity> {
    return cookout.createIdentity(name, { owner });
  }
  yield* Effect.all([person("bob"), person("cy"), person("dee"), person("eve")], { concurrency: 1 });
  const [poster, reactor, watcher] = yield* Effect.all(
    [agent("bob/poster", "bob"), agent("cy/reactor", "cy"), agent("dee/watcher", "dee"), agent("eve/idle", "eve")],
    { concurrency: 1 },
  );
  yield* answer(() => cookout.client.createChannel({ name: "grill" }));
  const { message } = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "anyone?" }));
  const act = Effect.all(
    [
      answer(() => poster.client.createMessage({ channel: "grill", text: "me" })),
      answer(() => reactor.client.react(message.id, "thumbs_up")),
    ],
    { concurrency: 1 },
  );
  return { act, cookout, watcher };
});

it.effect(
  "an active agent a person owns posting, reacting or being Online holds off their offer; a quiet one doesn't",
  () =>
    Effect.gen(function* agentsHoldOff() {
      const { act, cookout, watcher } = yield* fourOwners;
      yield* Effect.andThen(quietFor("20 days"), act);
      yield* quietFor(JUST_UNDER_TEN_DAYS);
      const atThirty = Effect.andThen(quietFor("1 millis"), offersOnceThere(cookout.client, ONE));
      const whileOnline = yield* Effect.scoped(Effect.andThen(stayOnline(watcher), atThirty));
      const atFifty = yield* Effect.andThen(quietFor("20 days"), offersOnceThere(cookout.client, THREE));

      expect([namesIn(whileOnline), namesIn(atFifty)]).toStrictEqual([["eve"], ["eve", "bob", "cy"]]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("the offer about a quiet person comes again every 30 days, and they are never deactivated", () =>
  Effect.gen(function* everyThirtyDays() {
    const { ada, bob } = yield* adminsAndBob;
    function cycle(quietDays: number): Effect.Effect<readonly Summary[]> {
      const raised = Effect.repeat(Effect.map(personOffers(ada.client), offersOnBob), {
        until: (offers) => Arr.some(offers, (offer) => offer.quietDays === quietDays),
      });
      return Effect.andThen(quietFor("30 days"), raised);
    }
    const cycles = yield* Effect.forEach([THIRTY, SIXTY, NINETY], cycle, { concurrency: 1 });
    const afterNinety = yield* Effect.andThen(
      quietFor("30 days"),
      answer(() => bob.client.whoami()),
    );

    expect(cycles).toStrictEqual([
      [{ cleared: false, person: "bob", quietDays: 30 }],
      [{ cleared: false, person: "bob", quietDays: SIXTY }],
      [{ cleared: false, person: "bob", quietDays: NINETY }],
    ]);
    expect(afterNinety.identity.deactivated ?? false).toBe(false);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("one admin's Keep clears the offer about a person for every admin", () =>
  Effect.gen(function* keepShared() {
    const { ada, cookout } = yield* adminsAndBob;
    const adas = yield* Effect.andThen(quietFor("30 days"), offersOnceThere(ada.client, TWO));
    yield* offersOnceThere(cookout.client, TWO);
    yield* answer(() => ada.client.keepDeactivationOffer(offerOn(adas, "bob")));
    const open = yield* Effect.all([personOffers(ada.client), personOffers(cookout.client)], { concurrency: 1 });
    const admins = yield* history(cookout.client);

    expect(Arr.map(open, namesIn)).toStrictEqual([["admin"], ["ada"]]);
    expect(admins).toContainEqual({ cleared: true, person: "bob", quietDays: 30 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("no offer is raised about the last active admin; once a second admin exists, one is", () =>
  Effect.gen(function* lastAdmin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    const alone = yield* Effect.andThen(quietFor("40 days"), offersOnceThere(cookout.client, ONE));
    yield* answer(() => cookout.client.makeAdmin("ada"));
    const adas = yield* Effect.andThen(settled, offersOnceThere(ada.client, ONE));

    expect([namesIn(alone), namesIn(adas)]).toStrictEqual([["ada"], ["admin"]]);
  }).pipe(Effect.provide(testCookout())),
);

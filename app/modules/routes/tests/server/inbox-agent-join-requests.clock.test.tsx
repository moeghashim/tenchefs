import type { CookoutClient, EventStream } from "../../../sdk/index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { createTestAgent } from "../../../testing/index.ts";
import { inPane } from "../regions.ts";
import { openAt } from "../render.tsx";
import { screen } from "@testing-library/react";
import { watched } from "../watched.ts";

const ROW = "@ada/scout asks to join from build-box.";
const SETTLE = "30 millis";
const LIFETIME = "10 minutes";
const ALMOST_PEOPLE_WAIT = "179 seconds";
const LAST_SECOND = "1 second";
const BROUGHT_IN_ROW = "@worker asks to join from build-box.";

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function inboxOpenFor(client: CookoutClient): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openInbox() {
    const { live, stream } = watched(client);
    openAt({ client, hash: "#/inbox", live });
    yield* Effect.acquireRelease(
      answer(() => stream),
      (events: EventStream) => answer(() => events.close()),
    );
    yield* answer(() => inPane().findByText("You're all caught up."));
  });
}

it.effect("a pending join request leaves the owner's inbox when it expires, with no reload", () =>
  Effect.gen(function* expiresLive() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("ada/scout", { owner: "ada" });
    yield* inboxOpenFor(ada.client);
    yield* answer(() => cookout.clientFor().startAgentJoin({ as: "ada/scout", host: "build-box" }));
    const shown = yield* answer(() => inPane().findByText(ROW));
    yield* Effect.andThen(settled, TestClock.adjust(LIFETIME));
    yield* answer(() => inPane().findByText("You're all caught up."));

    expect([shown.textContent, screen.queryByText(ROW)]).toStrictEqual([ROW, null]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

const broughtInWorker: Effect.Effect<CookoutClient, never, TestCookout> = Effect.gen(function* bringInWorker() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
  yield* answer(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: "Worker", name: "worker" }));
  yield* cookout.createIdentity("ada/scout", { owner: "ada" });
  return ada.client;
});

it.effect("a join request for an agent another agent brought in reaches its owner's inbox only after 3 minutes", () =>
  Effect.gen(function* shownAfterWait() {
    const cookout = yield* TestCookout;
    const owner = yield* broughtInWorker;
    yield* inboxOpenFor(owner);
    yield* answer(() => cookout.clientFor().startAgentJoin({ as: "worker", host: "build-box" }));
    yield* Effect.andThen(settled, TestClock.adjust(ALMOST_PEOPLE_WAIT));
    yield* answer(() => cookout.clientFor().startAgentJoin({ as: "ada/scout", host: "build-box" }));
    const before = yield* Effect.andThen(
      answer(() => inPane().findByText(ROW)),
      Effect.sync(() => screen.queryByText(BROUGHT_IN_ROW)),
    );
    yield* Effect.andThen(settled, TestClock.adjust(LAST_SECOND));
    const shown = yield* answer(() => inPane().findByText(BROUGHT_IN_ROW));

    expect([before, shown.textContent]).toStrictEqual([null, BROUGHT_IN_ROW]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

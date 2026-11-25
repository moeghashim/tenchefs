import type { CookoutClient, EventStream } from "../../../sdk/index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { inPane } from "../regions.ts";
import { openAt } from "../render.tsx";
import { screen } from "@testing-library/react";
import { watched } from "../watched.ts";

const ROW = "@ada/scout asks to join from build-box.";
const SETTLE = "30 millis";
const LIFETIME = "10 minutes";

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

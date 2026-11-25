import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Effect } from "effect";
import type { EventStream } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";
import { answering } from "../answering.ts";
import { openAt } from "../render.tsx";
import { watched } from "../watched.ts";

const SETTLE = "30 millis";
const HUMAN = { kind: "human" } as const;
const TWO = 2;
const NONE = 0;

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function pageOpenFor(who: TestIdentity): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openPage() {
    const { answered, client } = answering(who.client);
    const { live, stream } = watched(client);
    openAt({ client, hash: "#/inbox", live });
    yield* Effect.acquireRelease(
      answer(() => stream),
      (events: EventStream) => answer(() => events.close()),
    );
    yield* answer(() => answered("inboxHistory"));
  });
}

function pagesShowing(name: string): number {
  return screen.queryAllByRole("list", { name }).length;
}

function earlierNudgesPerPage(): readonly number[] {
  const counts: number[] = [];
  for (const list of screen.getAllByRole("list", { name: "Earlier nudges" })) {
    counts.push(within(list).getAllByRole("listitem").length);
  }
  return counts;
}

function twoNudgesOneRead(ada: TestIdentity): Effect.Effect<void> {
  return Effect.gen(function* nudgeTwiceReadOne() {
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "Who owns the release notes?" }));
    yield* TestClock.adjust("1 minute");
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "Who owns the changelog?" }));
    yield* Effect.andThen(Effect.andThen(settled, TestClock.adjust("3 days")), settled);
    const { nudges } = yield* Effect.repeat(
      answer(() => ada.client.inbox()),
      { until: (inbox) => inbox.nudges.length >= TWO },
    );
    const [oldest = null] = nudges;
    if (oldest !== null) {
      yield* answer(() => ada.client.markNudgeRead(oldest.id));
    }
  });
}

const twoPagesNudged: Effect.Effect<void, never, TestCookout | Scope.Scope> = Effect.gen(function* nudgeAdaTwice() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  yield* twoNudgesOneRead(ada);
  yield* Effect.andThen(pageOpenFor(ada), pageOpenFor(ada));
});

function clickMarkReadInFirstPage(): void {
  const [firstPane = null] = screen.getAllByRole("main");
  if (firstPane !== null) {
    fireEvent.click(within(firstPane).getByRole("button", { name: "Mark read" }));
  }
}

it.effect("a nudge marked read in one page leaves For you in the person's other page too, with no reload", () =>
  Effect.gen(function* markedReadElsewhere() {
    yield* twoPagesNudged;
    yield* answer(() =>
      waitFor(() => {
        expect([pagesShowing("For you"), pagesShowing("Earlier nudges")]).toStrictEqual([TWO, TWO]);
      }),
    );
    clickMarkReadInFirstPage();
    yield* answer(() =>
      waitFor(() => {
        expect(screen.queryAllByText("You're all caught up.")).toHaveLength(TWO);
      }),
    );

    expect([pagesShowing("For you"), earlierNudgesPerPage()]).toStrictEqual([NONE, [TWO, TWO]]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

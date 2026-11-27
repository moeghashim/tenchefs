import type { CookoutClient, EventStream, Message } from "../../../sdk/index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane, inSidebar } from "../regions.ts";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";
import { openAt } from "../render.tsx";
import { watched } from "../watched.ts";

const NUDGE = "Quiet for 3 days: close it, or follow up?";
const SETTLE = "30 millis";
const HUMAN = { kind: "human" } as const;
const TWO = 2;
const BEFORE_THE_INBOX_OPENS = "71 hours";
const WHILE_IT_IS_OPEN = "1 hour";

interface Nudged {
  readonly ada: TestIdentity;
  readonly bob: TestIdentity;
  readonly thread: Message;
}

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function inboxOpenFor(who: TestIdentity, client: CookoutClient = who.client): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openInbox() {
    const { live, stream } = watched(who.client);
    openAt({ client, hash: "#/inbox", live });
    yield* Effect.acquireRelease(
      answer(() => stream),
      (events: EventStream) => answer(() => events.close()),
    );
    yield* answer(() => screen.findByText("Nothing read yet."));
  });
}

function quietForThreeDaysWith(
  inboxOpen: Effect.Effect<void, never, Scope.Scope>,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* passThreeDays() {
    yield* TestClock.adjust(BEFORE_THE_INBOX_OPENS);
    yield* inboxOpen;
    yield* Effect.andThen(Effect.andThen(settled, TestClock.adjust(WHILE_IT_IS_OPEN)), settled);
  });
}

const nudgedLive: Effect.Effect<Nudged, never, TestCookout | Scope.Scope> = Effect.gen(function* nudgeAda() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  const { message: thread } = yield* answer(() =>
    ada.client.createMessage({ channel: "grill", text: "Who owns the release notes?\nAnd the changelog?" }),
  );
  yield* quietForThreeDaysWith(inboxOpenFor(ada));
  yield* answer(() => inPane().findByText(NUDGE));
  return { ada, bob, thread };
});

function textsOf(elements: Iterable<Readonly<{ textContent: string }>>): readonly string[] {
  const texts: string[] = [];
  for (const element of elements) {
    texts.push(element.textContent);
  }
  return texts;
}

function inboxCounts(): readonly string[] {
  const link = inSidebar().getByRole("link", { name: /^Inbox/u });
  return textsOf(within(link).queryAllByText(/^\d+ (?:unread|for you)$/u));
}

function forYouRows(): readonly string[] {
  const list = screen.queryByRole("list", { name: "For you" });
  if (list === null) {
    return [];
  }
  return textsOf(within(list).getAllByRole("listitem"));
}

function earlierNudges(): readonly string[] {
  const list = screen.queryByRole("list", { name: "Earlier nudges" });
  if (list === null) {
    return [];
  }
  return textsOf(within(list).getAllByRole("listitem"));
}

function clickInForYou(name: string): void {
  fireEvent.click(within(screen.getByRole("list", { name: "For you" })).getByRole("button", { name }));
}

function refusingClose(client: CookoutClient): CookoutClient {
  return {
    ...client,
    closeThread: () => Promise.reject(new Error("refused")),
  };
}

const twoNudgedWithCloseRefused: Effect.Effect<TestIdentity, never, TestCookout | Scope.Scope> = Effect.gen(
  function* nudgeTwice() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* answer(() => ada.client.createChannel({ name: "grill" }));
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "Who owns the release notes?" }));
    yield* TestClock.adjust("1 minute");
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "Who owns the changelog?" }));
    yield* quietForThreeDaysWith(inboxOpenFor(ada, refusingClose(ada.client)));
    yield* answer(() => inPane().findByText("Who owns the release notes?"));
    return ada;
  },
);

const caughtUp = answer(() => inPane().findByText("You're all caught up."));

it.effect("after 3 quiet days the starter's inbox shows the nudge under For you and counts it, with no reload", () =>
  Effect.gen(function* nudgeShows() {
    const { thread } = yield* nudgedLive;
    const link = within(screen.getByRole("list", { name: "For you" })).getByRole("link", { name: /grill/u });

    expect([
      screen.getByRole("heading", { level: 2, name: "For you 1" }).textContent,
      forYouRows(),
      inboxCounts(),
      link.getAttribute("href"),
    ]).toStrictEqual([
      "For you 1",
      [expect.stringMatching(/Quiet for 3 days: close it, or follow up\?.*#grill.*Who owns the release notes\?/u)],
      ["1 for you"],
      `#/channels/grill/threads/${String(thread.id)}`,
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Close in a nudge row closes the thread as the reader, and the row leaves the inbox, Earlier too", () =>
  Effect.gen(function* closeInRow() {
    const { ada, thread } = yield* nudgedLive;
    clickInForYou("Close");
    yield* caughtUp;
    const { parent } = yield* answer(() => ada.client.getThread(thread.id));

    expect([parent.closedBy, forYouRows(), inboxCounts(), earlierNudges()]).toStrictEqual(["ada", [], [], []]);

    yield* Effect.map(
      answer(() => ada.client.inbox()),
      ({ nudges }) => {
        expect(nudges).toStrictEqual([]);
      },
    );
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Mark read in a nudge row moves it to Earlier and drops the count", () =>
  Effect.gen(function* markRead() {
    const { ada } = yield* nudgedLive;
    clickInForYou("Mark read");
    yield* caughtUp;
    const { nudges } = yield* answer(() => ada.client.inbox());

    expect([forYouRows(), inboxCounts(), earlierNudges(), nudges]).toStrictEqual([
      [],
      [],
      [expect.stringContaining(NUDGE)],
      [],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Mark all as read marks the nudge read with the rest, moving it to Earlier", () =>
  Effect.gen(function* markAll() {
    const { ada } = yield* nudgedLive;
    fireEvent.click(inPane().getByRole("button", { name: "Mark all as read" }));
    yield* caughtUp;
    const { nudges } = yield* answer(() => ada.client.inbox());

    expect([forYouRows(), inboxCounts(), earlierNudges(), nudges]).toStrictEqual([
      [],
      [],
      [expect.stringContaining(NUDGE)],
      [],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("a reply by someone else in the thread clears the nudge row live, from Earlier too", () =>
  Effect.gen(function* replyClears() {
    const { bob, thread } = yield* nudgedLive;
    yield* answer(() => bob.client.createMessage({ channel: "grill", replyTo: thread.id, text: "I do" }));
    yield* answer(() => inPane().findByText("I do"));

    expect([forYouRows(), earlierNudges()]).toStrictEqual([[expect.not.stringContaining(NUDGE)], []]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("two quiet threads give two nudge rows, newest first, and a refused Close keeps the row unread", () =>
  Effect.gen(function* refusedClose() {
    const ada = yield* twoNudgedWithCloseRefused;
    const [newest = null] = within(screen.getByRole("list", { name: "For you" })).getAllByRole("button", {
      name: "Close",
    });
    if (newest !== null) {
      fireEvent.click(newest);
    }
    yield* settled;
    const { nudges } = yield* answer(() => ada.client.inbox());

    expect([forYouRows(), inboxCounts(), nudges.length]).toStrictEqual([
      [expect.stringContaining("Who owns the changelog?"), expect.stringContaining("Who owns the release notes?")],
      ["2 for you"],
      TWO,
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("deleting the nudged thread's channel takes the nudge row and its count out of the open Inbox, live", () =>
  Effect.gen(function* deleteClears() {
    yield* nudgedLive;
    const cookout = yield* TestCookout;
    yield* answer(() => cookout.client.deleteChannel("grill"));
    yield* answer(() => screen.findByText("You're all caught up."));

    expect([forYouRows(), inboxCounts(), screen.queryByRole("list", { name: "Earlier nudges" })]).toStrictEqual([
      [],
      [],
      null,
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

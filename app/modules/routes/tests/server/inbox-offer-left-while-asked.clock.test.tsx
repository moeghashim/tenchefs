import { Array as Arr, Effect } from "effect";
import type { CookoutClient, DeactivateIdentityResponse, EventStream } from "../../../sdk/index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { fireEvent, screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { holdsCallsOpen } from "../../../testing/web.ts";
import { inDialog } from "../regions.ts";
import { openAt } from "../render.tsx";
import { watched } from "../watched.ts";

const SETTLE = "30 millis";
const HUMAN = { kind: "human" } as const;
const BOTH = 2;
const SCOUT = "@ada/scout has had no activity for 30 days. Deactivate it?";
const ROVER = "@ada/rover has had no activity for 30 days. Deactivate it?";

interface Held {
  readonly client: CookoutClient;
  readonly release: Effect.Effect<void>;
}

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function quietFor(wait: "1 hour" | "719 hours"): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(settled, TestClock.adjust(wait)), settled);
}

function answerHeld(client: CookoutClient): Held {
  const answered = Promise.withResolvers<DeactivateIdentityResponse>();
  const calls: Promise<DeactivateIdentityResponse>[] = [];
  holdsCallsOpen("deactivateIdentity");
  return {
    client: {
      ...client,
      deactivateIdentity: (name) => {
        calls.push(client.deactivateIdentity(name));
        return answered.promise;
      },
    },
    release: Effect.suspend(() =>
      Effect.forEach(
        calls,
        (call) =>
          Effect.andThen(
            answer(() => call),
            (done) =>
              Effect.sync(() => {
                answered.resolve(done);
              }),
          ),
        { concurrency: 1 },
      ),
    ),
  };
}

function inboxOpenFor(client: CookoutClient): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openInbox() {
    const { live, stream } = watched(client);
    openAt({ client, hash: "#/inbox", live });
    yield* Effect.acquireRelease(
      answer(() => stream),
      (events: EventStream) => answer(() => events.close()),
    );
    yield* answer(() => screen.findByText("Nothing read yet."));
  });
}

const offeredHeld: Effect.Effect<Pick<Held, "release">, never, TestCookout | Scope.Scope> = Effect.gen(
  function* offerTwo() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("ada/scout", { owner: "ada" });
    yield* cookout.createIdentity("ada/rover", { owner: "ada" });
    yield* quietFor("719 hours");
    const held = answerHeld(ada.client);
    yield* inboxOpenFor(held.client);
    yield* quietFor("1 hour");
    yield* answer(() => screen.findByText(SCOUT));
    return { release: held.release };
  },
);

function forYou(): HTMLElement {
  return screen.getByRole("list", { hidden: true, name: "For you" });
}

function rowsBehindTheDialog(): readonly HTMLElement[] {
  return within(forYou()).getAllByRole("listitem", { hidden: true });
}

function rowSaying(text: string): HTMLElement {
  return within(forYou()).getByText(text).closest("li") ?? globalThis.document.body;
}

const offerLeft: Effect.Effect<HTMLElement> = answer(() =>
  waitFor(() => screen.getByRole("heading", { hidden: true, level: 2, name: "For you 1" })),
);

function gone(text: string): Effect.Effect<void> {
  const row = rowSaying(text);
  return answer(() => waitForElementToBeRemoved(row));
}

function textsOf(rows: readonly Readonly<{ readonly textContent: string }>[]): readonly string[] {
  return Arr.map(rows, ({ textContent }) => textContent);
}

it.effect("an offer that leaves before its Deactivate is answered keeps its row until the question closes", () =>
  Effect.gen(function* rowKept() {
    const { release } = yield* offeredHeld;
    fireEvent.click(within(rowSaying(SCOUT)).getByRole("button", { name: "Deactivate" }));
    const confirm = yield* answer(() => inDialog().findByRole("button", { name: "Deactivate @ada/scout" }));
    fireEvent.click(confirm);
    yield* offerLeft;
    const kept = rowsBehindTheDialog().length;
    const scoutGone = gone(SCOUT);
    yield* release;
    yield* scoutGone;

    expect([kept, textsOf(rowsBehindTheDialog())]).toStrictEqual([BOTH, [expect.stringContaining(ROVER)]]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

import { adminClient, opened, shown } from "./held-store.ts";
import { expect, it, vi } from "vitest";
import { createBoardStore } from "../index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const ONCE = 1;
const TWICE = 2;

interface Reported {
  readonly links: readonly string[];
  readonly calls: readonly number[];
}

interface Heard {
  readonly calls: number;
  readonly link: string;
}

function reportedDownThenUp(): Reported {
  const { hand, store } = opened();
  const listener = vi.fn<() => void>();
  for (const unsubscribe of [
    store.subscribeShowing("channels")(vi.fn<() => void>()),
    store.subscribeToLink(listener),
  ]) {
    shown(unsubscribe);
  }
  const first = store.link();
  const seen = (["down", "up"] as const).map((link): Heard => {
    hand.report(link);
    return { calls: listener.mock.calls.length, link: store.link() };
  });
  return { calls: seen.map((each) => each.calls), links: [first, ...seen.map((each) => each.link)] };
}

it("the store says the live link is down until it comes back", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const { calls, links } = reportedDownThenUp();

  expect(links).toStrictEqual(["up", "down", "up"]);
  expect(calls).toStrictEqual([ONCE, TWICE]);
});

it("a store with no live stream says its link is up", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const store = createBoardStore({ client: adminClient(), live: null, url: webTestCookout().url });
  const listener = vi.fn<() => void>();
  shown(store.subscribeToLink(listener));

  expect(store.link()).toBe("up");
  expect(listener).not.toHaveBeenCalled();
});

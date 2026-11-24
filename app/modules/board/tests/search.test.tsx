import type { CookoutClient, SearchRequest } from "../../sdk/index.ts";
import type { Search, SearchState } from "../../search/web.ts";
import { expect, it, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import { createBoardStore } from "../index.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { createSearch } from "../../search/web.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

type Found = SearchState["found"];
type SearchCall = Parameters<typeof createSearch>[typeof FIRST]["search"];

const PAGE = 2;
const FIRST = 0;
const NO_PAUSE = 0;

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

function opened(): BoardStore {
  return createBoardStore({ client: adminClient(), live: createLive(handLive().adapter), url: webTestCookout().url });
}

async function postedAll(channel: string, texts: readonly string[]): Promise<void> {
  const [text, ...rest] = texts;
  if (typeof text === "string") {
    await adminClient().createMessage({ channel, text });
    await postedAll(channel, rest);
  }
}

async function postedIn(channel: string, texts: readonly string[]): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await postedAll(channel, texts);
}

function textsOf(found: Found): readonly string[] {
  if (found.status !== "found") {
    return [];
  }
  return found.results.map((result) => result.message.text);
}

interface HeldBack {
  readonly search: SearchCall;
  readonly asked: Promise<null>;
  readonly answered: () => Promise<null>;
}

function heldBack(store: BoardStore, query: string): HeldBack {
  const held = Promise.withResolvers<null>();
  const asked = Promise.withResolvers<null>();
  const answered = Promise.withResolvers<null>();
  async function search(request: SearchRequest): ReturnType<SearchCall> {
    const holding = request.query === query;
    asked.resolve(null);
    await (holding && held.promise);
    const answer = await store.calls.search(request);
    globalThis.queueMicrotask(() => {
      answered.resolve(null);
    });
    return answer;
  }
  return {
    answered: async () => {
      held.resolve(null);
      const done = await answered.promise;
      return done;
    },
    asked: asked.promise,
    search,
  };
}

async function shownTexts(shown: Search, texts: readonly string[]): Promise<void> {
  await vi.waitFor(() => {
    expect(textsOf(shown.snapshot().found)).toStrictEqual(texts);
  });
}

it("the board store's search answers a page newest first, or the server's refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await postedIn("bs-search", ["Quokkabs first", "Quokkabs second"]);
  const store = opened();

  const found = await store.calls.search({ query: "quokkabs" });
  const refused = await store.calls.search({ query: "in:#bs-no-such-channel" });

  expect([found, refused]).toMatchObject([
    { page: { results: [{ message: { text: "Quokkabs second" } }, { message: { text: "Quokkabs first" } }] } },
    { refusal: { code: "unknown_channel" } },
  ]);
});

it("an answer to an older query that arrives after a newer one's is dropped", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await postedIn("bs-search-race", ["Wombatrace old", "Numbatrace new"]);
  const held = heldBack(opened(), "wombatrace");
  const shown = createSearch({ pause: NO_PAUSE, search: held.search });
  shown.edit("wombatrace");
  await held.asked;
  shown.edit("numbatrace");
  await shownTexts(shown, ["Numbatrace new"]);
  await held.answered();

  expect(textsOf(shown.snapshot().found)).toStrictEqual(["Numbatrace new"]);
});

it("loading more adds the next page, and moving onto the last result loaded loads it too", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await postedIn("bs-search-pages", ["Dingopage 1", "Dingopage 2", "Dingopage 3", "Dingopage 4", "Dingopage 5"]);
  const shown = createSearch({ limit: PAGE, search: opened().calls.search });
  shown.edit("dingopage");
  await shownTexts(shown, ["Dingopage 5", "Dingopage 4"]);
  shown.loadMore();
  await shownTexts(shown, ["Dingopage 5", "Dingopage 4", "Dingopage 3", "Dingopage 2"]);
  for (const direction of ["up", "down", "down"] as const) {
    shown.move(direction);
  }

  await shownTexts(shown, ["Dingopage 5", "Dingopage 4", "Dingopage 3", "Dingopage 2", "Dingopage 1"]);
});

it("a query with neither words nor filters asks nothing, and closing keeps the query", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const search = vi.fn<SearchCall>();
  const shown = createSearch({ pause: NO_PAUSE, search });

  shown.edit("   ");
  shown.move("down");
  shown.close();

  expect([search.mock.calls, shown.snapshot()]).toStrictEqual([
    [],
    { found: { status: "idle" }, highlighted: null, open: false, query: "   " },
  ]);
});

import type { MessageId, Refusal, SearchRequest } from "../../sdk/index.ts";
import type { SearchResponse, SearchSort } from "../index.ts";
import { isEmptyQuery, parseQuery } from "../index.ts";

type SearchAnswer = { readonly page: SearchResponse } | { readonly refusal: Refusal };

type SearchCall = (request: SearchRequest) => Promise<SearchAnswer>;

type Found =
  | { readonly status: "idle" }
  | { readonly status: "searching" }
  | { readonly status: "refused"; readonly message: string }
  | {
      readonly status: "found";
      readonly ids: readonly MessageId[];
      readonly cursor: string | null;
      readonly loadingMore: boolean;
    };

interface SearchState {
  readonly query: string;
  readonly caret: number;
  readonly suggestion: number;
  readonly dismissed: boolean;
  readonly sort: SearchSort;
  readonly open: boolean;
  readonly found: Found;
  readonly highlighted: number;
}

type Direction = "down" | "up";

interface Search {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SearchState;
  readonly edit: (query: string, caret?: number) => void;
  readonly sortBy: (sort: SearchSort) => void;
  readonly open: () => void;
  readonly close: () => void;
  readonly loadMore: () => void;
  readonly move: (direction: Direction, ahead?: number) => void;
  readonly moveSuggestion: (direction: Direction, count: number) => void;
  readonly dismissSuggestions: () => void;
}

interface SearchOptions {
  readonly search: SearchCall;
  readonly pause?: number;
  readonly limit?: number;
}

const PAUSE_MS = 250;
const IDLE: Found = { status: "idle" };
const SEARCHING: Found = { status: "searching" };
const FIRST = 0;
const ONE = 1;
const STEPS: Readonly<Record<Direction, number>> = { down: ONE, up: -ONE };

interface Asked {
  readonly query: string;
  readonly sort: SearchSort;
  readonly cursor: string | null;
  readonly limit: number | null;
}

function requestOf(asked: Asked): SearchRequest {
  return {
    query: asked.query,
    sort: asked.sort,
    ...(asked.cursor !== null && { cursor: asked.cursor }),
    ...(asked.limit !== null && { limit: asked.limit }),
  };
}

function idsOf(found: Found): readonly MessageId[] {
  if (found.status !== "found") {
    return [];
  }
  return found.ids;
}

function cursorOf(page: SearchResponse): string | null {
  if (!page.hasMore) {
    return null;
  }
  return page.cursor;
}

function foundAfter(earlier: readonly MessageId[], answer: SearchAnswer): Found {
  if ("refusal" in answer) {
    return { message: answer.refusal.message, status: "refused" };
  }
  const { page } = answer;
  const ids = [...earlier, ...page.results.map((result) => result.message.id)];
  return { cursor: cursorOf(page), ids, loadingMore: false, status: "found" };
}

function movedTo(at: number, direction: Direction, count: number): number {
  return Math.max(Math.min(at + STEPS[direction], count - ONE), FIRST);
}

function wrappedTo(at: number, direction: Direction, count: number): number {
  const total = Math.max(count, ONE);
  return (at + STEPS[direction] + total) % total;
}

function foundWhileEditing(query: string): Found {
  if (isEmptyQuery(parseQuery(query))) {
    return IDLE;
  }
  return SEARCHING;
}

interface Held {
  readonly state: () => SearchState;
  readonly set: (next: Partial<SearchState>) => void;
  readonly subscribe: Search["subscribe"];
}

const searchKeys: readonly (keyof SearchState)[] = [
  "caret",
  "dismissed",
  "found",
  "highlighted",
  "open",
  "query",
  "sort",
  "suggestion",
];

function heldState(): Held {
  const listeners = new Set<() => void>();
  let state: SearchState = {
    caret: FIRST,
    dismissed: false,
    found: IDLE,
    highlighted: FIRST,
    open: false,
    query: "",
    sort: "newest",
    suggestion: FIRST,
  };
  return {
    set: (next) => {
      const changed: SearchState = { ...state, ...next };
      if (searchKeys.every((key) => Object.is(changed[key], state[key]))) {
        return;
      }
      state = changed;
      for (const listener of listeners) {
        listener();
      }
    },
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

interface Asking {
  readonly ask: (cursor: string | null) => void;
  readonly drop: () => void;
}

async function alongside(earlier: Promise<void>, later: Promise<void>): Promise<void> {
  await earlier;
  await later;
}

function asking(held: Held, options: SearchOptions): Asking {
  let latest = FIRST;
  let asked = Promise.resolve();
  async function ask(cursor: string | null): Promise<void> {
    latest += ONE;
    const mine = latest;
    const { found, query, sort } = held.state();
    const answer = await options.search(requestOf({ cursor, limit: options.limit ?? null, query, sort }));
    if (mine === latest) {
      held.set({ found: foundAfter(idsOf(found), answer) });
    }
  }
  return {
    ask: (cursor) => {
      asked = alongside(asked, ask(cursor));
    },
    drop: () => {
      latest += ONE;
    },
  };
}

function loaderOf(held: Held, asker: Asking): () => void {
  return () => {
    const { found } = held.state();
    if (found.status !== "found" || found.cursor === null || found.loadingMore) {
      return;
    }
    held.set({ found: { ...found, loadingMore: true } });
    asker.ask(found.cursor);
  };
}

interface FirstPage {
  readonly stop: () => void;
  readonly later: () => void;
  readonly now: () => void;
}

function firstPageOf(asker: Asking, pause: number): FirstPage {
  let waiting: ReturnType<typeof globalThis.setTimeout> | null = null;
  function now(): void {
    asker.ask(null);
  }
  return {
    later: () => {
      waiting = globalThis.setTimeout(now, pause);
    },
    now,
    stop: () => {
      if (waiting !== null) {
        globalThis.clearTimeout(waiting);
      }
      asker.drop();
    },
  };
}

function sorterOf(held: Held, firstPage: FirstPage): Search["sortBy"] {
  return (sort) => {
    const { query, sort: sorted } = held.state();
    if (sort === sorted) {
      return;
    }
    firstPage.stop();
    const found = foundWhileEditing(query);
    held.set({ found, highlighted: FIRST, sort });
    if (found === SEARCHING) {
      firstPage.now();
    }
  };
}

function createSearch(options: SearchOptions): Search {
  const held = heldState();
  const asker = asking(held, options);
  const loadMore = loaderOf(held, asker);
  const firstPage = firstPageOf(asker, options.pause ?? PAUSE_MS);
  return {
    close: () => {
      held.set({ highlighted: FIRST, open: false });
    },
    dismissSuggestions: () => {
      held.set({ dismissed: true, suggestion: FIRST });
    },
    edit: (query, caret = query.length) => {
      firstPage.stop();
      const found = foundWhileEditing(query);
      held.set({ caret, dismissed: false, found, highlighted: FIRST, open: true, query, suggestion: FIRST });
      if (found === SEARCHING) {
        firstPage.later();
      }
    },
    loadMore,
    move: (direction, ahead = FIRST) => {
      const count = ahead + idsOf(held.state().found).length;
      const highlighted = movedTo(held.state().highlighted, direction, count);
      held.set({ highlighted });
      if (highlighted > ahead - ONE && highlighted === count - ONE) {
        loadMore();
      }
    },
    moveSuggestion: (direction, count) => {
      held.set({ suggestion: wrappedTo(held.state().suggestion, direction, count) });
    },
    open: () => {
      held.set({ open: true });
    },
    snapshot: held.state,
    sortBy: sorterOf(held, firstPage),
    subscribe: held.subscribe,
  };
}

export { type Search, type SearchAnswer, type SearchState, createSearch };

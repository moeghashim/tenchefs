import type { Refusal, SearchRequest } from "../../sdk/index.ts";
import type { SearchResponse, SearchResult } from "../index.ts";
import { isEmptyQuery, parseQuery } from "../index.ts";

type SearchAnswer = { readonly page: SearchResponse } | { readonly refusal: Refusal };

type SearchCall = (request: SearchRequest) => Promise<SearchAnswer>;

type Found =
  | { readonly status: "idle" }
  | { readonly status: "searching" }
  | { readonly status: "refused"; readonly message: string }
  | {
      readonly status: "found";
      readonly results: readonly SearchResult[];
      readonly cursor: string | null;
      readonly loadingMore: boolean;
    };

interface SearchState {
  readonly query: string;
  readonly open: boolean;
  readonly found: Found;
  readonly highlighted: number | null;
}

type Direction = "down" | "up";

interface Search {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SearchState;
  readonly edit: (query: string) => void;
  readonly open: () => void;
  readonly close: () => void;
  readonly loadMore: () => void;
  readonly move: (direction: Direction) => void;
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
  readonly cursor: string | null;
  readonly limit: number | null;
}

function requestOf(asked: Asked): SearchRequest {
  return {
    query: asked.query,
    ...(asked.cursor !== null && { cursor: asked.cursor }),
    ...(asked.limit !== null && { limit: asked.limit }),
  };
}

function resultsOf(found: Found): readonly SearchResult[] {
  if (found.status !== "found") {
    return [];
  }
  return found.results;
}

function cursorOf(page: SearchResponse): string | null {
  if (!page.hasMore) {
    return null;
  }
  return page.cursor;
}

function foundAfter(earlier: readonly SearchResult[], answer: SearchAnswer): Found {
  if ("refusal" in answer) {
    return { message: answer.refusal.message, status: "refused" };
  }
  const { page } = answer;
  return { cursor: cursorOf(page), loadingMore: false, results: [...earlier, ...page.results], status: "found" };
}

function startOf(direction: Direction, count: number): number {
  if (direction === "down") {
    return FIRST;
  }
  return count - ONE;
}

function movedTo(at: number | null, direction: Direction, count: number): number | null {
  if (count === FIRST) {
    return null;
  }
  if (at === null) {
    return startOf(direction, count);
  }
  return Math.min(Math.max(at + STEPS[direction], FIRST), count - ONE);
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

function heldState(): Held {
  const listeners = new Set<() => void>();
  let state: SearchState = { found: IDLE, highlighted: null, open: false, query: "" };
  return {
    set: (next) => {
      state = { ...state, ...next };
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
    const { found, query } = held.state();
    const answer = await options.search(requestOf({ cursor, limit: options.limit ?? null, query }));
    if (mine === latest) {
      held.set({ found: foundAfter(resultsOf(found), answer) });
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

function createSearch(options: SearchOptions): Search {
  const held = heldState();
  const asker = asking(held, options);
  const loadMore = loaderOf(held, asker);
  let waiting: ReturnType<typeof globalThis.setTimeout> | null = null;
  function firstPage(): void {
    asker.ask(null);
  }
  return {
    close: () => {
      held.set({ highlighted: null, open: false });
    },
    edit: (query) => {
      if (waiting !== null) {
        globalThis.clearTimeout(waiting);
      }
      asker.drop();
      const found = foundWhileEditing(query);
      held.set({ found, highlighted: null, open: true, query });
      if (found === SEARCHING) {
        waiting = globalThis.setTimeout(firstPage, options.pause ?? PAUSE_MS);
      }
    },
    loadMore,
    move: (direction) => {
      const count = resultsOf(held.state().found).length;
      const highlighted = movedTo(held.state().highlighted, direction, count);
      held.set({ highlighted });
      if (highlighted === count - ONE) {
        loadMore();
      }
    },
    open: () => {
      held.set({ open: true });
    },
    snapshot: held.state,
    subscribe: held.subscribe,
  };
}

export { type Search, type SearchAnswer, type SearchState, createSearch };

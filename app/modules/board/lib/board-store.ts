import type { PresenceClient, Presences } from "./presence-slice.ts";
import type { Live } from "../../live/index.ts";
import type { Part } from "./slice.ts";
import { createPart } from "./slice.ts";
import { presenceSlice } from "./presence-slice.ts";

interface BoardState {
  readonly presence: Presences;
}

type Shown = keyof BoardState;

type Subscribe = (listener: () => void) => () => void;

interface BoardStore {
  readonly subscribe: Subscribe;
  readonly snapshot: () => BoardState;
  readonly subscribeShowing: (shown: Shown) => Subscribe;
}

interface BoardStoreOptions {
  readonly client: PresenceClient;
  readonly live: Live | null;
}

interface Listeners {
  readonly subscribe: Subscribe;
  readonly notify: () => void;
}

interface Showing {
  readonly part: Part<unknown>;
  readonly follow: () => void;
  readonly subscribe: Subscribe;
}

function createListeners(): Listeners {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function follower(live: Live | null, parts: readonly Part<unknown>[]): () => void {
  let following = false;
  return () => {
    if (following || live === null) {
      return;
    }
    following = true;
    live.subscribe((event) => {
      for (const part of parts) {
        part.apply(event);
      }
    });
    live.onBack(() => {
      for (const part of parts) {
        part.back();
      }
    });
  };
}

function showing({ follow, part, subscribe }: Showing): Subscribe {
  return (listener) => {
    follow();
    const unsubscribe = subscribe(listener);
    part.show();
    return () => {
      unsubscribe();
      part.hide();
    };
  };
}

function createBoardStore(options: BoardStoreOptions): BoardStore {
  const { notify, subscribe } = createListeners();
  let snapshot: BoardState | null = null;
  const presence = createPart({
    changed: () => {
      snapshot = null;
      notify();
    },
    client: options.client,
    slice: presenceSlice,
  });
  const follow = follower(options.live, [presence]);
  const subscribers = { presence: showing({ follow, part: presence, subscribe }) };
  return {
    snapshot: () => {
      snapshot ??= { presence: presence.state() };
      return snapshot;
    },
    subscribe,
    subscribeShowing: (shown) => subscribers[shown],
  };
}

function presences(state: BoardState): Presences {
  return state.presence;
}

export { type BoardStore, createBoardStore, presences };
export type { Presences } from "./presence-slice.ts";

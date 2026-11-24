import { NOTHING_HELD, appliedToMessages } from "./messages-table.ts";
import type { CookoutEvent } from "../../sdk/index.ts";
import type { MessagesHeld } from "./messages-table.ts";

const NO_READERS = 0;

interface Reading<Value> {
  readonly request: () => Promise<Value>;
  readonly change: (held: MessagesHeld, value: Value) => MessagesHeld;
}

interface Held {
  readonly current: () => MessagesHeld;
  readonly put: (next: MessagesHeld) => void;
  readonly heard: (event: CookoutEvent) => void;
  readonly readInto: <Value>(reading: Reading<Value>) => Promise<Value>;
}

function replayed(held: MessagesHeld, events: readonly CookoutEvent[]): MessagesHeld {
  let next = held;
  for (const event of events) {
    next = appliedToMessages({ event, held: next });
  }
  return next;
}

function createHeld(changed: () => void): Held {
  let state = NOTHING_HELD;
  const listening = new Set<CookoutEvent[]>();
  function put(next: MessagesHeld): void {
    if (next !== state) {
      state = next;
      changed();
    }
  }
  return {
    current: () => state,
    heard: (event) => {
      for (const heard of listening) {
        heard.push(event);
      }
      put(appliedToMessages({ event, held: state }));
    },
    put,
    readInto: async ({ change, request }) => {
      const heard: CookoutEvent[] = [];
      listening.add(heard);
      try {
        const value = await request();
        put(replayed(change(state, value), heard));
        return value;
      } finally {
        listening.delete(heard);
      }
    },
  };
}

interface Queues {
  readonly enqueue: (key: string, step: () => Promise<void>) => void;
  readonly started: (key: string) => boolean;
}

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function createQueues(): Queues {
  const queues = new Map<string, Promise<void>>();
  return {
    enqueue: (key, step) => {
      queues.set(key, after(queues.get(key) ?? Promise.resolve(), step));
    },
    started: (key) => queues.has(key),
  };
}

interface Counted {
  readonly readers: ReadonlyMap<string, number>;
  readonly key: string;
}

function readersOf({ key, readers }: Counted): number {
  return readers.get(key) ?? NO_READERS;
}

export { type Held, type Queues, createHeld, createQueues, readersOf };

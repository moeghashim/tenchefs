import { expect, it } from "vitest";
import { recordPublishes } from "../../testing/web.ts";

interface Counter {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => { readonly count: number };
  readonly set: (count: number) => void;
}

const NONE = 0;
const FIRST = 1;
const SECOND = 2;

function counter(): Counter {
  const listeners = new Set<() => void>();
  let current = { count: 0 };
  return {
    set: (count) => {
      current = { count };
      for (const listener of listeners) {
        listener();
      }
    },
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

it("counts each publish that changes the snapshot", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const store = counter();
  const publishes = recordPublishes(store);

  store.set(FIRST);
  store.set(SECOND);

  expect(publishes.count()).toBe(SECOND);
});

it("counts nothing while the store publishes nothing", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const publishes = recordPublishes(counter());

  expect(publishes.count()).toBe(NONE);
});

it.fails("fails the test when a publish leaves the snapshot deep-equal to the one before", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const store = counter();
  const publishes = recordPublishes(store);

  store.set(FIRST);
  store.set(FIRST);

  expect(publishes.count()).toBe(SECOND);
});

it.fails("fails the test when a publish leaves the very same snapshot", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const store = counter();
  const publishes = recordPublishes({ snapshot: () => ({ count: 0 }), subscribe: store.subscribe });

  store.set(FIRST);

  expect(publishes.count()).toBe(FIRST);
});

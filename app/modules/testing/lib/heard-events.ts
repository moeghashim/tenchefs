import type { CookoutEvent, ServerSentEvent } from "../../sdk/index.ts";
import { parseEvent } from "../../sdk/index.ts";

type Matches = (event: CookoutEvent) => boolean;

interface Waiter {
  readonly matches: Matches;
  readonly resolve: (heard: boolean) => void;
}

interface HeardEvents {
  readonly heard: (matches: Matches) => Promise<void>;
  readonly record: (frame: ServerSentEvent) => void;
}

function claimed(unclaimed: Set<CookoutEvent>, matches: Matches): boolean {
  for (const event of unclaimed) {
    if (matches(event)) {
      unclaimed.delete(event);
      return true;
    }
  }
  return false;
}

function woken(waiters: Set<Waiter>, event: CookoutEvent): boolean {
  for (const waiter of waiters) {
    if (waiter.matches(event)) {
      waiters.delete(waiter);
      waiter.resolve(true);
      return true;
    }
  }
  return false;
}

function heardEvents(): HeardEvents {
  const unclaimed = new Set<CookoutEvent>();
  const waiters = new Set<Waiter>();
  return {
    heard: async (matches) => {
      if (claimed(unclaimed, matches)) {
        return;
      }
      const { promise, resolve } = Promise.withResolvers<boolean>();
      waiters.add({ matches, resolve });
      await promise;
    },
    record: (frame) => {
      const event = parseEvent(frame);
      if (event !== null && !woken(waiters, event)) {
        unclaimed.add(event);
      }
    },
  };
}

export { type HeardEvents, heardEvents };

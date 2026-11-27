import type { DeactivationOffer, DeactivationOfferId } from "../../sdk/index.ts";

interface AskedOffer {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => readonly DeactivationOffer[];
  readonly ask: (offer: DeactivationOffer) => void;
  readonly closed: (id: DeactivationOfferId) => void;
}

interface Shown {
  readonly offers: readonly DeactivationOffer[];
  readonly asked: readonly DeactivationOffer[];
}

function shownWith({ asked, offers }: Shown): readonly DeactivationOffer[] {
  const left = asked.filter(({ id }) => !offers.some((offer) => offer.id === id));
  return [...offers, ...left].toSorted((first, second) => second.id - first.id);
}

function createAskedOffer(): AskedOffer {
  const listeners = new Set<() => void>();
  let asked: readonly DeactivationOffer[] = [];
  function set(next: readonly DeactivationOffer[]): void {
    asked = next;
    for (const listener of listeners) {
      listener();
    }
  }
  return {
    ask: (offer) => {
      set([offer]);
    },
    closed: (id) => {
      set(asked.filter((offer) => offer.id !== id));
    },
    snapshot: () => asked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { createAskedOffer, shownWith };
export type { AskedOffer };

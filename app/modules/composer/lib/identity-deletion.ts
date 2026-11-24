import { closedHref, hrefOf, locationOf } from "../../paths/index.ts";
import type { BoardStore } from "../../board/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { deletedIdentities } from "../../board/index.ts";

interface IdentityDeletion {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => IdentityName | null;
  readonly dismiss: () => void;
}

function closingHref(name: IdentityName): string | null {
  const { profile, route } = locationOf(globalThis.location.hash);
  if (route.name === "profile" && route.identity === name) {
    return hrefOf({ name: "people" });
  }
  if (profile === name) {
    return closedHref(route);
  }
  return null;
}

function followDeletions(
  store: Pick<BoardStore, "snapshot" | "subscribe">,
  closeIfOpen: (name: IdentityName) => void,
): void {
  let seen = deletedIdentities(store.snapshot());
  store.subscribe(() => {
    const deleted = deletedIdentities(store.snapshot());
    for (const name of deleted) {
      if (!seen.has(name)) {
        closeIfOpen(name);
      }
    }
    seen = deleted;
  });
}

function createIdentityDeletion(store: Pick<BoardStore, "snapshot" | "subscribe">): IdentityDeletion {
  const listeners = new Set<() => void>();
  let notice: IdentityName | null = null;

  function show(next: IdentityName | null): void {
    notice = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function closeIfOpen(name: IdentityName): void {
    const href = closingHref(name);
    if (href !== null) {
      globalThis.location.hash = href;
      show(name);
    }
  }

  followDeletions(store, closeIfOpen);
  return {
    dismiss: () => {
      show(null);
    },
    snapshot: () => notice,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type IdentityDeletion, createIdentityDeletion };

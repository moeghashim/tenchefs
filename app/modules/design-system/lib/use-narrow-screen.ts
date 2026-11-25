import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 48rem)";

function wideQuery(): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== "function") {
    return null;
  }
  return globalThis.matchMedia(WIDE);
}

function subscribe(listener: () => void): () => void {
  const query = wideQuery();
  if (query !== null) {
    query.addEventListener("change", listener);
  }
  return () => {
    if (query !== null) {
      query.removeEventListener("change", listener);
    }
  };
}

function isNarrow(): boolean {
  const query = wideQuery();
  return query !== null && !query.matches;
}

function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, isNarrow);
}

export { useNarrowScreen };

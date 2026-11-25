import type { BrowserStorage } from "../../browser-storage/index.ts";

interface MemoryStorage extends BrowserStorage {
  readonly kept: () => ReadonlyMap<string, string>;
}

function memoryStorage(): MemoryStorage {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    kept: () => new Map(kept),
    removeItem: (key) => {
      kept.delete(key);
    },
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

export { type MemoryStorage, memoryStorage };

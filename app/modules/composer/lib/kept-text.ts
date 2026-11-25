import type { BrowserStorage } from "../../browser-storage/index.ts";
import { keptTextKey } from "../../browser-storage/index.ts";

const NOBODY = "";

interface KeptText {
  readonly key: string;
  readonly text: () => string;
  readonly keep: (text: string) => void;
}

function keptIn(storage: BrowserStorage, key: string): KeptText {
  return {
    keep: (text) => {
      if (text === "") {
        storage.removeItem(key);
        return;
      }
      storage.setItem(key, text);
    },
    key,
    text: () => storage.getItem(key) ?? "",
  };
}

function pageOnly(): BrowserStorage {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    removeItem: (key) => {
      kept.delete(key);
    },
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

function keptTextIn(storage: BrowserStorage): (identity: string | null, box: string) => KeptText {
  const withNobody = pageOnly();
  return (identity, box) => {
    if (identity === null) {
      return keptIn(withNobody, keptTextKey({ box, identity: NOBODY }));
    }
    return keptIn(storage, keptTextKey({ box, identity }));
  };
}

export { type KeptText, keptTextIn };

import type { ListedGroup } from "./list.ts";
import type { Platform } from "./chords.ts";
import { shortcutListOf } from "./list.ts";

const FIRST = 0;
const ONE = 1;

interface Announced {
  readonly text: string;
  readonly count: number;
}

interface KeymapState {
  readonly shortcutList: readonly ListedGroup[];
  readonly shortcutListOpen: boolean;
  readonly announced: Announced;
}

interface KeymapStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => KeymapState;
  readonly openShortcutList: () => void;
  readonly closeShortcutList: () => void;
  readonly announce: (text: string) => void;
}

function createKeymapStore(platform: Platform): KeymapStore {
  let state: KeymapState = {
    announced: { count: FIRST, text: "" },
    shortcutList: shortcutListOf(platform),
    shortcutListOpen: false,
  };
  const listeners = new Set<() => void>();
  function set(changed: Partial<KeymapState>): void {
    state = { ...state, ...changed };
    for (const listener of listeners) {
      listener();
    }
  }
  function setOpen(shortcutListOpen: boolean): void {
    if (shortcutListOpen !== state.shortcutListOpen) {
      set({ shortcutListOpen });
    }
  }
  return {
    announce: (text) => {
      set({ announced: { count: state.announced.count + ONE, text } });
    },
    closeShortcutList: () => {
      setOpen(false);
    },
    openShortcutList: () => {
      setOpen(true);
    },
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type KeymapStore, createKeymapStore };

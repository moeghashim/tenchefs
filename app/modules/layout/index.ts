/**
 * The `layout` store: how the web UI is laid out for the person at this
 * browser, apart from what the board holds. An external store, read by
 * components with `useSyncExternalStore`. `theme` is the chosen theme,
 * `system`, `light` or `dark`: `chooseTheme` keeps it in the browser's
 * storage and sets it on the page's root element as `data-theme` (`system`
 * removes it, so the stylesheet follows the operating system's
 * `prefers-color-scheme`); the store reads it back when made, so a reload
 * keeps it. `sidebar` is whether the sidebar is open on a narrow screen;
 * `toggleSidebar` flips it, and `closeSidebar` closes the sidebar, as after
 * following a link in it. `collapsed` is whether the sidebar is collapsed to
 * a narrow rail on a wide screen; `toggleCollapsed` flips it and keeps it in
 * the browser's storage, so a reload keeps it. `identityFilter` and `identityKind` narrow the
 * directory of identities: the text a name must contain, and `all`, `human`
 * or `agent`; `filterIdentities` and `showKind` set them. `showDeactivated`
 * is whether it lists Deactivated identities too, which `toggleDeactivated`
 * flips. `threadWidth` is the width, in pixels, of the open thread panel on a
 * wide screen, whether the thread was opened from a channel or the Inbox,
 * and of a channel conversation opened from the Inbox;
 * `resizeThread` sets it, kept within `threadWidths`' `min` and `max`, and
 * keeps it in the browser's storage, so a reload keeps it and the next thread
 * opens at it. `sidebarWidth` is the width, in pixels, of the sidebar on a
 * wide screen while it isn't collapsed; `resizeSidebar` sets it, kept within
 * `sidebarWidths`' `min` and `max`, and keeps it in the browser's storage, so
 * a reload keeps it.
 */
import type { IdentityKind } from "../sdk/index.ts";

const themeChoices = ["system", "light", "dark"] as const;

type KindChoice = "all" | IdentityKind;

interface LayoutState {
  readonly theme: ThemeChoice;
  readonly sidebar: boolean;
  readonly collapsed: boolean;
  readonly identityFilter: string;
  readonly identityKind: KindChoice;
  readonly showDeactivated: boolean;
  readonly threadWidth: number;
  readonly sidebarWidth: number;
}

interface Widths {
  readonly key: string;
  readonly max: number;
  readonly min: number;
  readonly start: number;
}

interface LayoutOptions {
  readonly storage: Pick<Storage, "getItem" | "removeItem" | "setItem">;
  readonly root: Pick<HTMLElement, "removeAttribute" | "setAttribute">;
}

const THEME_KEY = "cookout-theme";
const COLLAPSED_KEY = "cookout-sidebar-collapsed";
const COLLAPSED = "collapsed";
const THREAD_WIDTH_KEY = "cookout-thread-width";
const threadWidths = { max: 768, min: 320, start: 448, step: 32 } as const;
const SIDEBAR_WIDTH_KEY = "cookout-sidebar-width";
const sidebarWidths = { max: 448, min: 192, start: 256, step: 32 } as const;
const THEME_ATTRIBUTE = "data-theme";
const SYSTEM: ThemeChoice = "system";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return themeChoices.some((choice) => choice === value);
}

function storedTheme(storage: LayoutOptions["storage"]): ThemeChoice {
  const stored = storage.getItem(THEME_KEY);
  if (isThemeChoice(stored)) {
    return stored;
  }
  return SYSTEM;
}

function keepTheme(options: LayoutOptions, theme: ThemeChoice): void {
  if (theme === SYSTEM) {
    options.storage.removeItem(THEME_KEY);
    options.root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }
  options.storage.setItem(THEME_KEY, theme);
  options.root.setAttribute(THEME_ATTRIBUTE, theme);
}

function keepCollapsed(storage: LayoutOptions["storage"], collapsed: boolean): void {
  if (collapsed) {
    storage.setItem(COLLAPSED_KEY, COLLAPSED);
    return;
  }
  storage.removeItem(COLLAPSED_KEY);
}

const THREAD: Widths = { ...threadWidths, key: THREAD_WIDTH_KEY };
const SIDEBAR: Widths = { ...sidebarWidths, key: SIDEBAR_WIDTH_KEY };

function withinBounds(widths: Widths, width: number): number {
  return Math.min(widths.max, Math.max(widths.min, Math.round(width)));
}

function storedWidth(storage: LayoutOptions["storage"], widths: Widths): number {
  const stored = Number(storage.getItem(widths.key) ?? Number.NaN);
  if (Number.isFinite(stored)) {
    return withinBounds(widths, stored);
  }
  return widths.start;
}

interface Resizing {
  readonly storage: LayoutOptions["storage"];
  readonly widths: Widths;
  readonly current: () => number;
  readonly publish: (width: number) => void;
}

function resizer({ current, publish, storage, widths }: Resizing): (width: number) => void {
  return (width) => {
    const kept = withinBounds(widths, width);
    if (kept !== current()) {
      storage.setItem(widths.key, String(kept));
      publish(kept);
    }
  };
}

type Resizers = Pick<Layout, "resizeSidebar" | "resizeThread">;

function resizers(
  storage: LayoutOptions["storage"],
  publish: (next: Partial<LayoutState>) => void,
  snapshot: () => LayoutState,
): Resizers {
  return {
    resizeSidebar: resizer({
      current: () => snapshot().sidebarWidth,
      publish: (sidebarWidth) => {
        publish({ sidebarWidth });
      },
      storage,
      widths: SIDEBAR,
    }),
    resizeThread: resizer({
      current: () => snapshot().threadWidth,
      publish: (threadWidth) => {
        publish({ threadWidth });
      },
      storage,
      widths: THREAD,
    }),
  };
}

type DirectoryControls = Pick<Layout, "filterIdentities" | "showKind" | "toggleDeactivated">;

function directoryControls(
  publish: (next: Partial<LayoutState>) => void,
  snapshot: () => LayoutState,
): DirectoryControls {
  return {
    filterIdentities: (identityFilter) => {
      publish({ identityFilter });
    },
    showKind: (identityKind) => {
      publish({ identityKind });
    },
    toggleDeactivated: () => {
      publish({ showDeactivated: !snapshot().showDeactivated });
    },
  };
}

/** The themes a person can choose: `system` follows the operating system's setting. */
export { themeChoices };

/** The thread panel's widths in pixels: its narrowest and widest, the one it starts at, and one arrow key's step. */
export { threadWidths };

/** The sidebar's widths in pixels on a wide screen: its narrowest and widest, the one it starts at, and one arrow key's step. */
export { sidebarWidths };

/** One of the theme choices. */
export type ThemeChoice = (typeof themeChoices)[number];

/** Which kind of identity the directory shows: every identity, or one kind. */
export type { KindChoice };

/** The layout store. `subscribe` and `snapshot` are the two halves `useSyncExternalStore` takes. */
export interface Layout {
  /** Calls `listener` after every change, until the returned function is called. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current snapshot: a new object whenever it changes, the same one until then. */
  readonly snapshot: () => LayoutState;
  /** Applies the theme at once and keeps it in the browser's storage. */
  readonly chooseTheme: (theme: ThemeChoice) => void;
  /** Opens the sidebar on a narrow screen, or closes it if it is open. */
  readonly toggleSidebar: () => void;
  /** Closes the sidebar on a narrow screen. */
  readonly closeSidebar: () => void;
  /** Collapses the sidebar to a narrow rail on a wide screen, or expands it, and keeps the choice in the browser's storage. */
  readonly toggleCollapsed: () => void;
  /** Sets the thread panel's width, kept within `threadWidths`, and keeps it in the browser's storage. */
  readonly resizeThread: (width: number) => void;
  /** Sets the sidebar's width on a wide screen, kept within `sidebarWidths`, and keeps it in the browser's storage. */
  readonly resizeSidebar: (width: number) => void;
  /** Sets the text the directory filters identity names by. */
  readonly filterIdentities: (text: string) => void;
  /** Shows only identities of this kind, or every identity. */
  readonly showKind: (kind: KindChoice) => void;
  /** Lists Deactivated identities in the directory too, or stops. */
  readonly toggleDeactivated: () => void;
}

/**
 * Makes a layout store that keeps the theme in `options.storage` and sets it on `options.root`.
 * @param options The storage and the root element.
 * @returns The store.
 */
export function createLayout(options: LayoutOptions): Layout {
  const listeners = new Set<() => void>();
  let current: LayoutState = {
    collapsed: options.storage.getItem(COLLAPSED_KEY) === COLLAPSED,
    identityFilter: "",
    identityKind: "all",
    showDeactivated: false,
    sidebar: false,
    sidebarWidth: storedWidth(options.storage, SIDEBAR),
    theme: storedTheme(options.storage),
    threadWidth: storedWidth(options.storage, THREAD),
  };
  keepTheme(options, current.theme);

  function publish(next: Partial<LayoutState>): void {
    current = { ...current, ...next };
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    chooseTheme: (theme) => {
      keepTheme(options, theme);
      publish({ theme });
    },
    closeSidebar: () => {
      if (current.sidebar) {
        publish({ sidebar: false });
      }
    },
    ...directoryControls(publish, () => current),
    ...resizers(options.storage, publish, () => current),
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggleCollapsed: () => {
      keepCollapsed(options.storage, !current.collapsed);
      publish({ collapsed: !current.collapsed, sidebar: false });
    },
    toggleSidebar: () => {
      publish({ sidebar: !current.sidebar });
    },
  };
}

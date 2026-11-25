/**
 * The `browser-storage` module: the one owner of what the web UI keeps in the
 * browser's local storage, and of every key it keeps it under, so no other
 * module spells a key. Nothing here reaches the server, and nothing is shared
 * across browsers or devices. `BrowserStorage` is the part of the browser's
 * `Storage` a store is given ([web.tsx](../../web.tsx) passes
 * `localStorage`); `storageKeys` names the layout's keys: the theme (which
 * `public/assets/theme.js` also reads before the first paint, so the two must
 * agree), whether the sidebar is collapsed, and the thread panel's and the
 * sidebar's widths. `keptTextKey({ identity, box })` is the key for the text an
 * identity has typed in one message box and not sent yet (#600), one key per
 * identity and box, so a box shows only its own text, and only to the
 * identity that typed it.
 */

/** The part of the browser's `Storage` a store reads and writes. */
export type BrowserStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** The layout's keys in the browser's storage. */
export const storageKeys = {
  sidebarCollapsed: "cookout-sidebar-collapsed",
  sidebarWidth: "cookout-sidebar-width",
  theme: "cookout-theme",
  threadWidth: "cookout-thread-width",
} as const;

/** Whose unsent text, in which message box: a channel's name, or `channel/id` for a thread's reply box. */
export interface KeptTextOf {
  readonly identity: string;
  readonly box: string;
}

/**
 * The key for the unsent text an identity has typed in a message box.
 * @param of The identity and the box.
 * @returns The key.
 */
export function keptTextKey(of: KeptTextOf): string {
  return `cookout-kept-text:${of.identity}:${of.box}`;
}

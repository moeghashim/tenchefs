/**
 * The routes: the web UI's one tested interface (ADR 0015). `CookoutApp`
 * reads the page's location hash and draws the view for it. Until the session
 * is logged in, every route shows the login view, alone on the page. Once it
 * is, every route is drawn in the workspace, with the sidebar beside it:
 * `#/` (or no hash) and `#/inbox` the inbox, so the app opens on it, also
 * right after logging in; `#/login` who is logged in; `#/people` the
 * directory of every identity, and `#/people/<name>` the same with that
 * identity's profile open beside it; `#/channels/<name>` the channel; and `#/channels/<name>/threads/<id>` the channel with the thread's
 * panel open beside it. Any other hash opens the inbox, the homepage, as the
 * sidebar's "cookout" name does; a channel name that isn't a channel name, or
 * a thread ID that isn't a message ID, says there is nothing here.
 * With `live`, while the live stream's link to the server is down, a
 * "Reconnecting…" bar shows at the top of the workspace.
 * `#/approve/<user code>` is the approval page for a login request, a page of
 * its own outside the workspace (after the login view, if logged out), and
 * `#/approve-join/<user code>` the same for an agent join request. Any
 * workspace route's hash can end in `?profile=<name>`, which opens that
 * identity's profile panel beside it (replacing a thread's panel); Escape or
 * its close link closes it. Clicking a name, a message's author or an
 * `@name`, goes there. The
 * `paths` module reads the hash and builds every link's.
 * The app makes the board's old per-channel and per-thread stores, which the views still read, from `boardStore`, as
 * thin adapters over its selectors and methods, for the last migration ticket to delete.
 */
import type { ReactNode } from "react";
import { RouteView } from "./lib/route-view.tsx";
import type { Stores } from "./lib/stores.ts";
import { locationOf } from "../paths/index.ts";
import { useSyncExternalStore } from "react";
import { withBoard } from "./lib/board-adapter.ts";

function subscribeToHash(listener: () => void): () => void {
  globalThis.addEventListener("hashchange", listener);
  return () => {
    globalThis.removeEventListener("hashchange", listener);
  };
}

function currentHash(): string {
  return globalThis.location.hash;
}

/** What the web UI reads: the stores, each made with the SDK client it talks through. */
export type CookoutAppProps = Omit<Stores, "board">;

/**
 * The whole web UI: the view for the page's location hash, redrawn when it changes.
 * @param props The stores.
 * @returns The app.
 */
export function CookoutApp(props: CookoutAppProps): ReactNode {
  const hash = useSyncExternalStore(subscribeToHash, currentHash);
  return <RouteView place={locationOf(hash)} stores={withBoard(props)} />;
}

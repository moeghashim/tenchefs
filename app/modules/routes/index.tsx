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
 * While the board store says the live stream's link to the server is down, a
 * "Reconnecting…" bar shows at the top of the workspace.
 * `#/approve/<user code>` is the approval page for a login request, a page of
 * its own outside the workspace (after the login view, if logged out), and
 * `#/approve-join/<user code>` the same for an agent join request. Any
 * workspace route's hash can end in `?profile=<name>`, which opens that
 * identity's profile panel beside it (replacing a thread's panel); Escape or
 * its close link closes it. Clicking a name, a message's author or an
 * `@name`, goes there. `keymap` owns every keyboard shortcut: the app adds its one key listener to the page while
 * drawn, and `?` (off a text box) or Ctrl/Cmd+/ opens the list of every shortcut on any page. After a move
 * that asks for it (logging in, Alt+↑/↓, a Ctrl/Cmd+K jump, a new channel, a sidebar link on a narrow screen, an
 * identity card's View profile), the app's `landing` focuses the new view's element once it is drawn: a profile's
 * panel heading, a thread's reply box, a channel's message box, or else the view's level-1 heading; the login page
 * focuses its Token field. Files dropped on a channel, a thread or an Inbox conversation, its messages or its box,
 * wait in that conversation's box; the page refuses files dropped anywhere else, so the browser never opens them. The
 * `paths` module reads the hash and builds every link's.
 */
import { LandingContext, createLanding } from "../landing/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RouteView } from "./lib/route-view.tsx";
import { ShortcutListView } from "../views/index.tsx";
import type { Stores } from "./lib/stores.ts";
import { boardPageStores } from "./lib/board-page-stores.ts";
import { locationOf } from "../paths/index.ts";
import { useKeymapListener } from "./lib/use-keymap-listener.ts";
import { useLanding } from "./lib/use-landing.ts";
import { useStrayDropGuard } from "./lib/use-stray-drop-guard.ts";

function subscribeToHash(listener: () => void): () => void {
  globalThis.addEventListener("hashchange", listener);
  return () => {
    globalThis.removeEventListener("hashchange", listener);
  };
}

function currentHash(): string {
  return globalThis.location.hash;
}

/** What the web UI reads: the stores, each made with the SDK client it talks through. The app makes the new-channel form's, the scheduling dialog's and the scheduled messages list's page-only stores from `boardStore`. */
export type CookoutAppProps = Omit<Stores, "channelCreation" | "scheduleList" | "scheduling">;

/**
 * The whole web UI: the view for the page's location hash, redrawn when it changes.
 * @param props The stores.
 * @returns The app.
 */
export function CookoutApp(props: CookoutAppProps): ReactNode {
  const hash = useSyncExternalStore(subscribeToHash, currentHash);
  useStrayDropGuard();
  const page = useMemo(() => boardPageStores(props.boardStore), [props.boardStore]);
  const stores = useMemo(() => ({ ...props, ...page }), [page, props]);
  const landing = useMemo(() => createLanding(), []);
  useKeymapListener({ keymap: props.keymap, landing });
  useLanding({ hash, landing, session: props.session });
  return (
    <LandingContext value={landing}>
      <RouteView place={locationOf(hash)} stores={stores} />
      <ShortcutListView keymap={props.keymap} />
    </LandingContext>
  );
}

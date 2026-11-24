/**
 * The page's title: the one owner of `document.title`, so no view sets it.
 * `usePageTitle` sets it for the page being drawn: what the page is, then
 * `· cookout` ("Inbox · cookout", "#general · cookout", "Thread in #general ·
 * cookout", "@ada · cookout"), led by how many unread messages are *For you*
 * when there are any ("(3) Inbox · cookout"): those that mention whoever is
 * logged in or reply to their own message, as the sidebar's strong badges
 * count them, a closed thread's included as the Inbox includes them. Logged out, every route is titled for the login view, and
 * nothing is counted.
 */
import type { Unread, UnreadState } from "../unread/index.ts";
import { useEffect, useSyncExternalStore } from "react";
import type { Route } from "../paths/index.ts";
import type { Session } from "../board/index.ts";
import { countsOf } from "../unread/index.ts";

const APP = "cookout";
const NONE = 0;

const FIXED: Readonly<Record<Exclude<Route["name"], "channel" | "profile" | "thread">, string>> = {
  approve: "Approve a login",
  "approve-join": "Approve an agent",
  inbox: "Inbox",
  login: "Logged in",
  missing: "Nothing here",
  people: "People",
  settings: "Settings",
};

const LOGGED_OUT = "Log in";

const NOTHING_LOADED: UnreadState = { status: "loading" };

type SessionState = ReturnType<Session["snapshot"]>;

interface Followed {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => UnreadState;
}

function routeName(route: Route): string {
  if (route.name === "channel") {
    return `#${route.channel}`;
  }
  if (route.name === "thread") {
    return `Thread in #${route.channel}`;
  }
  if (route.name === "profile") {
    return `@${route.identity}`;
  }
  return FIXED[route.name];
}

function meOf(session: SessionState): string | null {
  if (session.status !== "logged-in") {
    return null;
  }
  return session.identity.name;
}

function pageName(me: string | null, route: Route): string {
  if (me === null) {
    return LOGGED_OUT;
  }
  return routeName(route);
}

function forYouCount(me: string | null, state: UnreadState): number {
  if (me === null || state.status !== "loaded") {
    return NONE;
  }
  return countsOf({ items: state.items, me }).forYou;
}

function titleOf(name: string, forYou: number): string {
  const title = `${name} · ${APP}`;
  if (forYou === NONE) {
    return title;
  }
  return `(${String(forYou)}) ${title}`;
}

const unchanging = new Set<() => void>();

function followNothing(listener: () => void): () => void {
  unchanging.add(listener);
  return () => {
    unchanging.delete(listener);
  };
}

function nothingLoaded(): UnreadState {
  return NOTHING_LOADED;
}

function followed(me: string | null, unread: Unread): Followed {
  if (me === null) {
    return { snapshot: nothingLoaded, subscribe: followNothing };
  }
  return unread;
}

/** What sets the title: the route drawn, the session, and the unread store, read only while logged in. */
export interface PageTitleOptions {
  readonly route: Route;
  readonly session: Pick<Session, "snapshot" | "subscribe">;
  readonly unread: Unread;
}

/**
 * Sets the page's title for the route drawn, led by the For you count of whoever is logged in.
 * @param options The route, the session, and the unread store.
 */
export function usePageTitle(options: PageTitleOptions): void {
  const session = useSyncExternalStore(options.session.subscribe, options.session.snapshot);
  const me = meOf(session);
  const store = followed(me, options.unread);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const title = titleOf(pageName(me, options.route), forYouCount(me, state));
  useEffect(() => {
    globalThis.document.title = title;
  }, [title]);
}

/**
 * The page's title: the one owner of `document.title`, so no view sets it.
 * `usePageTitle` sets it for the page being drawn: what the page is, then
 * `· cookout` ("Inbox · cookout", "#general · cookout", "Thread in #general ·
 * cookout", "@ada · cookout"), led by how many unread messages are *For you*
 * when there are any ("(3) Inbox · cookout"): those that mention whoever is
 * logged in or reply to their own message, as the sidebar's strong badges
 * count them, a closed thread's included as the Inbox includes them, with the unread notices beside them. It holds no
 * state of its own: the count and the logged-in identity are the board store's selectors (`inboxForYou`, the one the
 * sidebar's Inbox badge reads, and `loggedInName`), so the title and the sidebar never differ (#309). Logged out,
 * every route is titled for the login view, and nothing is counted or loaded.
 */
import type { BoardState, BoardStore } from "../board/index.ts";
import { inboxForYou, loggedInName } from "../board/index.ts";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Route } from "../paths/index.ts";

const APP = "cookout";
const NONE = 0;

const FIXED: Readonly<Record<Exclude<Route["name"], "channel" | "profile" | "thread">, string>> = {
  approve: "Approve a device",
  inbox: "Inbox",
  login: "Logged in",
  missing: "Nothing here",
  people: "People",
  settings: "Settings",
};

const LOGGED_OUT = "Log in";

type Subscribe = (listener: () => void) => () => void;

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

function pageName(me: string | null, route: Route): string {
  if (me === null) {
    return LOGGED_OUT;
  }
  return routeName(route);
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

function forYouOf(me: string | null, state: BoardState): number {
  if (me === null) {
    return NONE;
  }
  return inboxForYou({ me, state });
}

/** What sets the title: the route drawn, and the board store, whose Inbox is shown only while logged in. */
export interface PageTitleOptions {
  readonly route: Route;
  readonly board: Pick<BoardStore, "snapshot" | "subscribeShowing">;
}

/**
 * Sets the page's title for the route drawn, led by the For you count of whoever is logged in.
 * @param options The route and the board store.
 */
export function usePageTitle(options: PageTitleOptions): void {
  const { board } = options;
  const followSession = useMemo(() => board.subscribeShowing("session"), [board]);
  const me = useSyncExternalStore(followSession, () => loggedInName(board.snapshot()));
  const followInbox: Subscribe = useMemo(() => {
    if (me === null) {
      return followNothing;
    }
    return board.subscribeShowing("inbox");
  }, [board, me]);
  const forYou = useSyncExternalStore(followInbox, () => forYouOf(me, board.snapshot()));
  const title = titleOf(pageName(me, options.route), forYou);
  useEffect(() => {
    globalThis.document.title = title;
  }, [title]);
}

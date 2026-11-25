/**
 * The `live` module: the web's one reader of the live stream, and the one
 * owner of `EventSource`. `createLive` opens the all-channels feed
 * (`GET /v1/events?channels=all`) through an adapter once, when its follower
 * arrives, checks each event with the SDK's generated validators
 * (`parseEvent`), and hands it to that follower, for as long as the page
 * lives. An event that doesn't match the protocol, or whose type the SDK
 * doesn't know, is dropped.
 *
 * The stream has one follower: the board store (spec mattpocock/cookout#302,
 * "The event stream and reconnects"). `follow` takes it once and refuses a
 * second, so no other store hears an event or a reconnect: they read the
 * board store's selectors instead.
 *
 * The adapter also reports the stream's link to the server going `down` and
 * coming back `up`. `link` is the link as last reported (`up` until it is
 * reported down), and `subscribeToLink` calls its listener on each change, so
 * a view can show that the page may be stale. Each time the link comes back
 * after being down, the follower's `back` runs, so the board store can catch
 * up on what it missed (ADR `docs/adr/0068-a-page-catches-up-by-reading-again.md`).
 *
 * The browser's adapter is `eventSourceAdapter(url)`, whose `EventSource`
 * sends the session cookie and reconnects on its own, picking up from the last
 * event's ID; it reports the link down on the source's `error` and up on its
 * `open`. Tests in jsdom, which has no `EventSource` and keeps no cookies,
 * bring their own `LiveAdapter` (the testing module's `watchAdapter`).
 */
import type { CookoutEvent, ServerSentEvent } from "../sdk/index.ts";
import type { Link, LiveAdapter } from "./lib/adapter.ts";
import { parseEvent } from "../sdk/index.ts";

function checked(event: ServerSentEvent): CookoutEvent | null {
  try {
    return parseEvent(event);
  } catch {
    return null;
  }
}

interface LiveFollower {
  readonly heard: (event: CookoutEvent) => void;
  readonly back: () => void;
}

/** The live stream: `follow` hands each event on it to its one follower, opening the stream. */
export interface Live {
  /** Opens the stream for `follower`; throws if the stream already has a follower. */
  readonly follow: (follower: LiveFollower) => void;
  /** The stream's link to the server as last reported: `up` until the adapter reports it down. */
  readonly link: () => Link;
  /** Calls `listener` each time the link goes down or comes back, until the returned function is called. */
  readonly subscribeToLink: (listener: () => void) => () => void;
}

/**
 * Makes the live stream on an adapter, whose `open` starts sending each Server-Sent Event to its callback.
 * @param adapter How a stream is opened.
 * @returns The live stream.
 */
export function createLive(adapter: LiveAdapter): Live {
  const linkListeners = new Set<() => void>();
  let following: LiveFollower | null = null;
  let link: Link = "up";

  function reported(next: Link): void {
    if (next === link) {
      return;
    }
    link = next;
    for (const listener of linkListeners) {
      listener();
    }
    if (next === "up" && following !== null) {
      following.back();
    }
  }

  return {
    follow: (follower) => {
      if (following !== null) {
        throw new Error("The live stream already has its follower, the board store.");
      }
      following = follower;
      adapter.open((raw) => {
        const event = checked(raw);
        if (event !== null) {
          follower.heard(event);
        }
      }, reported);
    },
    link: () => link,
    subscribeToLink: (listener) => {
      linkListeners.add(listener);
      return () => {
        linkListeners.delete(listener);
      };
    },
  };
}

export { eventSourceAdapter } from "./lib/event-source.ts";
export type { Link, LiveAdapter } from "./lib/adapter.ts";

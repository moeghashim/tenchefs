import type { Reading, Unread } from "../../unread/index.ts";
import { createReading, createUnread } from "../../unread/index.ts";
import type { BoardStore } from "../../board/index.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Live } from "../../live/index.ts";
import { adminClient } from "./identities.ts";
import { createBoardStore } from "../../board/index.ts";
import { createPageFocus } from "../../page-focus/index.ts";
import { handClock } from "./hand-clock.ts";
import { handFocus } from "../../testing/web.ts";

interface BoardStoreOpening {
  readonly client: Pick<CookoutClient, "presence">;
  readonly live?: Live | undefined;
  readonly boardStore?: BoardStore | undefined;
}

export function boardStoreFor(opening: BoardStoreOpening): BoardStore {
  return opening.boardStore ?? createBoardStore({ client: opening.client, live: opening.live ?? null });
}

export function readingFor(reading: Reading | undefined): Reading {
  return reading ?? createReading({ clock: handClock().clock, page: createPageFocus(handFocus().adapter) });
}

export function unreadFor(unread: Unread | undefined): Unread {
  return unread ?? createUnread({ client: adminClient() });
}

export { createUnread } from "../../unread/index.ts";
export type { BoardStore } from "../../board/index.ts";
export type { Unread } from "../../unread/index.ts";
export type { Reading } from "../../unread/index.ts";

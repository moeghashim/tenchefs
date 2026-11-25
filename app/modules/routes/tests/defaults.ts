import type { Composer, ComposerOptions } from "../../composer/index.ts";
import type { Reading, Unread } from "../../unread/index.ts";
import { createReading, createUnread } from "../../unread/index.ts";
import { handFocus, memoryStorage } from "../../testing/web.ts";
import type { BoardStore } from "../../board/index.ts";
import type { Live } from "../../testing/web.ts";
import { createBoardStore } from "../../board/index.ts";
import { createComposer } from "../../composer/index.ts";
import { createPageFocus } from "../../page-focus/index.ts";
import { handClock } from "./hand-clock.ts";
import { slowCalls } from "./slow-calls.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const OPTIONS = 0;

type BoardStoreClient = Parameters<typeof createBoardStore>[typeof OPTIONS]["client"];

interface BoardStoreOpening {
  readonly client: BoardStoreClient;
  readonly live?: Live | undefined;
  readonly boardStore?: BoardStore | undefined;
  readonly pageSize?: number | undefined;
}

function boardStoreFor(opening: BoardStoreOpening): BoardStore {
  return (
    opening.boardStore ??
    createBoardStore({
      client: slowCalls(opening.client),
      live: opening.live ?? null,
      url: webTestCookout().url,
      ...(typeof opening.pageSize === "number" && { pageSize: opening.pageSize }),
    })
  );
}

interface ComposerOpening {
  readonly boardStore: BoardStore;
  readonly composer: Composer | undefined;
  readonly storage: ComposerOptions["storage"] | undefined;
}

function composerFor({ boardStore, composer, storage }: ComposerOpening): Composer {
  return composer ?? createComposer({ boardStore, storage: storage ?? memoryStorage() });
}

function readingFor(reading: Reading | undefined): Reading {
  return reading ?? createReading({ clock: handClock().clock, page: createPageFocus(handFocus().adapter) });
}

interface UnreadOpening {
  readonly unread: Unread | undefined;
  readonly boardStore: BoardStore;
}

function unreadFor({ boardStore, unread }: UnreadOpening): Unread {
  return unread ?? createUnread({ boardStore });
}

export { createKeymap } from "../../keymap/index.ts";
export { createUnread } from "../../unread/index.ts";
export type { BoardStore } from "../../board/index.ts";
export type { Live } from "../../testing/web.ts";
export type { BoardStoreClient };
export type { Unread } from "../../unread/index.ts";
export type { Reading } from "../../unread/index.ts";
export type { ComposerOptions } from "../../composer/index.ts";
export { boardStoreFor, composerFor, readingFor, unreadFor };

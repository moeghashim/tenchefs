import type { ChannelName, CookoutClient, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import { NOTHING_DELETED, withDeletedKept } from "./message-deletions.ts";
import { withEntry, withFresh } from "./messages-table.ts";
import type { Held } from "./messages-held.ts";
import { LOADING } from "./message-states.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { PageLoaded } from "./message-states.ts";
import { failure } from "./failure.ts";
import { newestSince } from "./newest-page.ts";

const NEWEST = -1;
const NONE = 0;

type PagesClient = Pick<CookoutClient, "ack" | "callCommand" | "createMessage" | "listMessages">;

interface PageAt {
  readonly held: Held;
  readonly client: PagesClient;
  readonly name: ChannelName;
  readonly pageSize: number;
}

interface Page {
  readonly hasMore: boolean;
  readonly messages: readonly TopLevelMessage[];
}

type PageChange = (page: PageLoaded) => PageLoaded;

interface PageOps {
  readonly loaded: () => PageLoaded | null;
  readonly update: (change: PageChange) => void;
  readonly changed: (change: PageChange) => (held: MessagesHeld) => MessagesHeld;
  readonly ack: (id: MessageId) => Promise<void>;
  readonly loadNewest: () => Promise<void>;
  readonly reloadNewest: () => Promise<void>;
  readonly loadOlder: () => Promise<void>;
}

function idsOf(messages: readonly TopLevelMessage[]): readonly MessageId[] {
  return messages.map((message) => message.id);
}

function loadedIn(held: MessagesHeld, name: ChannelName): PageLoaded | null {
  const page = held.pages.get(name) ?? LOADING;
  if (page.status !== "loaded") {
    return null;
  }
  return page;
}

function firstPage(page: Page): PageLoaded {
  return {
    call: { status: "idle" },
    callData: "",
    deleted: NOTHING_DELETED,
    expanded: new Map(),
    hasMore: page.hasMore,
    ids: idsOf(page.messages),
    older: { status: "idle" },
    post: { status: "idle" },
    read: { status: "none" },
    status: "loaded",
  };
}

function withNewest(page: PageLoaded, read: Page): PageLoaded {
  const oldest = Math.min(...read.messages.map((message) => message.id));
  const kept = page.ids.filter((id) => id < oldest);
  const ids = withDeletedKept({ before: page.ids, deleted: page.deleted, read: [...kept, ...idsOf(read.messages)] });
  if (kept.length === NONE) {
    return { ...page, hasMore: read.hasMore, ids };
  }
  return { ...page, ids };
}

function changedIn(at: PageAt): PageOps["changed"] {
  return (change) => (held) => {
    const page = loadedIn(held, at.name);
    if (page === null) {
      return held;
    }
    return { ...held, pages: withEntry({ key: at.name, map: held.pages, value: change(page) }) };
  };
}

function acking(at: PageAt, update: PageOps["update"]): PageOps["ack"] {
  return async (id) => {
    update((page) => ({ ...page, read: { status: "acking" } }));
    try {
      const { readPosition } = await at.client.ack(id);
      update((page) => ({ ...page, read: { readPosition, status: "acked" } }));
    } catch (error: unknown) {
      update((page) => ({ ...page, read: failure(error) }));
    }
  };
}

interface Base {
  readonly at: PageAt;
  readonly loaded: PageOps["loaded"];
  readonly update: PageOps["update"];
  readonly changed: PageOps["changed"];
  readonly ack: PageOps["ack"];
}

async function ackNewest(base: Base, messages: readonly TopLevelMessage[]): Promise<void> {
  await Promise.all(
    messages.slice(NEWEST).map(async (newest) => {
      await base.ack(newest.id);
    }),
  );
}

async function loadNewestOf(base: Base): Promise<void> {
  const { at } = base;
  try {
    const page = await at.held.readInto({
      change: (held, read) => ({
        ...withFresh({ fresh: read, held }),
        pages: withEntry({ key: at.name, map: held.pages, value: firstPage(read) }),
      }),
      request: async () => {
        const read = await at.client.listMessages(at.name, { limit: at.pageSize });
        return read;
      },
    });
    await ackNewest(base, page.messages);
  } catch (error: unknown) {
    const held = at.held.current();
    at.held.put({ ...held, pages: withEntry({ key: at.name, map: held.pages, value: failure(error) }) });
  }
}

async function reloadNewestOf(base: Base): Promise<void> {
  const { at } = base;
  const shown = base.loaded();
  if (shown === null) {
    await loadNewestOf(base);
    return;
  }
  try {
    const page = await at.held.readInto({
      change: (held, read) => base.changed((loaded) => withNewest(loaded, read))(withFresh({ fresh: read, held })),
      request: async () => {
        const read = await newestSince({ ...at, shown: shown.ids });
        return read;
      },
    });
    await ackNewest(base, page.messages);
  } catch (error: unknown) {
    base.update((page) => ({ ...page, read: failure(error) }));
  }
}

async function loadOlderOf(base: Base): Promise<void> {
  const { at } = base;
  const shown = base.loaded();
  if (shown === null || !shown.hasMore) {
    return;
  }
  const before = Math.min(...shown.ids);
  base.update((page) => ({ ...page, older: { status: "loading" } }));
  try {
    await at.held.readInto({
      change: (held, read) =>
        base.changed((page) => ({
          ...page,
          hasMore: read.hasMore,
          ids: [...idsOf(read.messages), ...page.ids],
          older: { status: "idle" },
        }))(withFresh({ fresh: read, held })),
      request: async () => {
        const read = await at.client.listMessages(at.name, { before, limit: at.pageSize });
        return read;
      },
    });
  } catch (error: unknown) {
    base.update((page) => ({ ...page, older: failure(error) }));
  }
}

function pageOps(at: PageAt): PageOps {
  function loaded(): PageLoaded | null {
    return loadedIn(at.held.current(), at.name);
  }
  const changed = changedIn(at);
  function update(change: PageChange): void {
    const held = at.held.current();
    const next = changed(change)(held);
    at.held.put(next);
  }
  const base: Base = { ack: acking(at, update), at, changed, loaded, update };
  return {
    ...base,
    loadNewest: async () => {
      await loadNewestOf(base);
    },
    loadOlder: async () => {
      await loadOlderOf(base);
    },
    reloadNewest: async () => {
      await reloadNewestOf(base);
    },
  };
}

export { type PageAt, type PageOps, type PagesClient, pageOps };

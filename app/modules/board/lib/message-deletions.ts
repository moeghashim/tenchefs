import type { ChannelName, Message, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { PageLoaded, PageState, ThreadLoaded, ThreadState } from "./message-states.ts";

const NONE = 0;

const NOTHING_DELETED: ReadonlySet<MessageId> = new Set();

interface Deletion {
  readonly message: Message;
  readonly parent?: TopLevelMessage;
}

interface Marking {
  readonly deleted: ReadonlySet<MessageId>;
  readonly shown: readonly MessageId[];
  readonly gone: readonly MessageId[];
}

function marked({ deleted, gone, shown }: Marking): ReadonlySet<MessageId> {
  const fresh = gone.filter((id) => shown.includes(id) && !deleted.has(id));
  if (fresh.length === NONE) {
    return deleted;
  }
  return new Set([...deleted, ...fresh]);
}

function pageMarked(page: PageState, { message }: Deletion): PageState {
  if (page.status !== "loaded") {
    return page;
  }
  const deleted = marked({ deleted: page.deleted, gone: [message.id], shown: page.ids });
  if (deleted === page.deleted) {
    return page;
  }
  return { ...page, deleted };
}

function goneFrom(thread: ThreadLoaded, { message }: Deletion): readonly MessageId[] {
  if (message.id === thread.parent) {
    return [thread.parent, ...thread.replies];
  }
  return [message.id];
}

function threadMarked(thread: ThreadState, deletion: Deletion): ThreadState {
  if (thread.status !== "loaded") {
    return thread;
  }
  const shown = [thread.parent, ...thread.replies];
  const deleted = marked({ deleted: thread.deleted, gone: goneFrom(thread, deletion), shown });
  if (deleted === thread.deleted) {
    return thread;
  }
  return { ...thread, deleted };
}

function eachMarked<Key, State>(
  views: ReadonlyMap<Key, State>,
  mark: (state: State) => State,
): ReadonlyMap<Key, State> {
  let next = views;
  for (const [key, state] of views) {
    const changed = mark(state);
    if (changed !== state) {
      next = new Map(next).set(key, changed);
    }
  }
  return next;
}

interface Views {
  readonly pages: ReadonlyMap<ChannelName, PageState>;
  readonly threads: ReadonlyMap<string, ThreadState>;
}

interface Deleting<Held extends Views> {
  readonly held: Held;
  readonly deletion: Deletion;
}

function viewsMarked<Held extends Views>({ deletion, held }: Deleting<Held>): Held {
  const pages = eachMarked(held.pages, (page) => pageMarked(page, deletion));
  const threads = eachMarked(held.threads, (thread) => threadMarked(thread, deletion));
  if (pages === held.pages && threads === held.threads) {
    return held;
  }
  return { ...held, pages, threads };
}

interface Reading {
  readonly before: readonly MessageId[];
  readonly deleted: ReadonlySet<MessageId>;
  readonly read: readonly MessageId[];
}

function withDeletedKept({ before, deleted, read }: Reading): readonly MessageId[] {
  const kept = before.filter((id) => deleted.has(id) && !read.includes(id));
  if (kept.length === NONE) {
    return read;
  }
  return [...read, ...kept].toSorted((one, other) => one - other);
}

function pageWithoutDeleted(page: PageLoaded): PageLoaded {
  if (page.deleted.size === NONE) {
    return page;
  }
  return { ...page, deleted: NOTHING_DELETED, ids: page.ids.filter((id) => !page.deleted.has(id)) };
}

function threadWithoutDeleted(thread: ThreadLoaded): ThreadLoaded | null {
  if (thread.deleted.size === NONE) {
    return thread;
  }
  if (thread.deleted.has(thread.parent)) {
    return null;
  }
  return { ...thread, deleted: NOTHING_DELETED, replies: thread.replies.filter((id) => !thread.deleted.has(id)) };
}

export { NOTHING_DELETED, pageWithoutDeleted, threadWithoutDeleted, viewsMarked, withDeletedKept };

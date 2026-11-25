import type { BoardStore, ThreadMessagesState } from "../../board/index.ts";
import type { InboxItem, Message, MessageId } from "../../sdk/index.ts";
import type { Newest, Reader, ReaderSources, Reading, Selection, Unread } from "../../unread/index.ts";
import { threadRead, useBoardStore } from "./use-board.ts";
import type { Read } from "./use-board.ts";
import type { ThreadSelection } from "../../paths/index.ts";
import { useSyncExternalStore } from "react";

const FIRST = 0;

interface ThreadReading {
  readonly unread: Unread;
  readonly reading: Reading;
  readonly selected: ThreadSelection;
  readonly me: string;
}

function newestOf(state: ThreadMessagesState, me: string): Newest | null {
  if (state.status !== "loaded") {
    return null;
  }
  let newest: Message = state.parent;
  for (const reply of state.replies) {
    newest = reply;
  }
  return { id: newest.id, mine: newest.author.name === me };
}

function firstOf(items: readonly InboxItem[]): MessageId | null {
  return items.map((item) => item.message.id).at(FIRST) ?? null;
}

interface Sources {
  readonly messages: Read<ThreadMessagesState>;
  readonly ack: (id: MessageId) => void;
  readonly selection: Selection;
  readonly unread: Unread;
  readonly me: string;
}

function readerSources({ ack, me, messages, selection, unread }: Sources): ReaderSources {
  return {
    ack,
    firstUnread: () => firstOf(selection.snapshot().items),
    markUnread: unread.markUnread,
    newest: () => newestOf(messages.snapshot(), me),
    subscribe: messages.subscribe,
    subscribeToUnread: selection.subscribe,
  };
}

function useThreadReader({ me, reading, selected, unread }: ThreadReading): Reader {
  const { channel, thread } = selected;
  const store: BoardStore = useBoardStore();
  const place = { channel, id: thread };
  const reader = reading.reader(
    `${channel}/${String(thread)}`,
    readerSources({
      ack: (id) => {
        store.threads.ack(place, id);
      },
      me,
      messages: threadRead({ acking: false, place, store }),
      selection: unread.selection(selected),
      unread,
    }),
  );
  useSyncExternalStore(reader.subscribe, reader.snapshot);
  return reader;
}

export { useThreadReader };

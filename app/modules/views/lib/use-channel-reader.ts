import type { ChannelName, InboxItem, MessageId } from "../../sdk/index.ts";
import type { Newest, Reader, ReaderSources, Reading, Unread } from "../../unread/index.ts";
import type { BoardStore } from "../../board/index.ts";
import { channelPostsOf } from "./channel-posts.ts";
import { useBoardStore } from "./use-board.ts";
import { useSyncExternalStore } from "react";

const FIRST = 0;

interface ChannelReading {
  readonly unread: Unread;
  readonly reading: Reading;
  readonly channel: ChannelName;
  readonly me: string;
}

function firstOf(items: readonly InboxItem[]): MessageId | null {
  return items.map((item) => item.message.id).at(FIRST) ?? null;
}

interface Sources extends Omit<ChannelReading, "reading"> {
  readonly store: BoardStore;
}

function readerSources({ channel, me, store, unread }: Sources): ReaderSources {
  const selection = unread.selection({ channel, thread: null });
  return {
    ack: store.calls.ack,
    firstUnread: () => firstOf(selection.snapshot().items),
    markUnread: unread.markUnread,
    newest: (): Newest | null => {
      const posts = channelPostsOf({
        channel,
        earlier: unread.earlier.snapshot(),
        items: selection.snapshot().items,
        me,
      });
      let newest: Newest | null = null;
      for (const post of posts ?? []) {
        newest = { id: post.id, mine: post.author.name === me };
      }
      return newest;
    },
    subscribe: (listener) => {
      const stops = [selection.subscribe(listener), unread.earlier.subscribe(listener)];
      return () => {
        for (const each of stops) {
          each();
        }
      };
    },
    subscribeToUnread: selection.subscribe,
  };
}

function useChannelReader({ reading, ...sources }: ChannelReading): Reader {
  const store = useBoardStore();
  const reader = reading.reader(sources.channel, readerSources({ ...sources, store }));
  useSyncExternalStore(reader.subscribe, reader.snapshot);
  return reader;
}

export { useChannelReader };

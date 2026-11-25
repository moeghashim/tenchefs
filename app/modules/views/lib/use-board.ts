import type {
  BoardState,
  BoardStore,
  ChannelMessagesState,
  ChannelsState,
  ClosingRefusal,
  CommandsState,
  ListedSchedules,
  MessageBeforeState,
  Outgoing,
  SubscriptionsState,
  ThreadClosing,
  ThreadMessagesState,
} from "../../board/index.ts";
import type { ChannelName, MessageId, SearchResult } from "../../sdk/index.ts";
import {
  channelList,
  channelPage,
  closingRefusal,
  commandList,
  deletedChannelNotice,
  deletedSchedules,
  messageBeforeOf,
  scheduleListOf,
  searchResultsOf,
  subscribedChannels,
  threadOf,
} from "../../board/index.ts";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";

type Subscribe = (listener: () => void) => () => void;

const BoardStoreContext = createContext<BoardStore | null>(null);

type Listed = "channels" | "commands" | "schedules" | "subscriptions";

interface ThreadPlace {
  readonly channel: ChannelName;
  readonly id: MessageId;
}

interface Read<State> {
  readonly subscribe: Subscribe;
  readonly snapshot: () => State;
}

interface ThreadReading {
  readonly place: ThreadPlace;
  readonly acking: boolean;
}

interface ThreadReadOf extends ThreadReading {
  readonly store: BoardStore;
}

interface ShownThread {
  readonly closing: ThreadClosing;
  readonly read: Read<ThreadMessagesState>;
  readonly state: ThreadMessagesState;
}

interface Replying {
  readonly place: ThreadPlace;
  readonly replied: (() => void) | null;
}

interface ChannelCalls {
  readonly call: (command: string, data: string, called: () => void) => void;
  readonly editCallData: (data: string) => void;
}

function useBoardStore(): BoardStore {
  const store = useContext(BoardStoreContext);
  if (store === null) {
    throw new Error("A view that reads the board store is drawn inside Authors, which provides it.");
  }
  return store;
}

function readOf<State>(store: BoardStore, subscribe: Subscribe, select: (state: BoardState) => State): Read<State> {
  return { snapshot: () => select(store.snapshot()), subscribe };
}

function threadRead({ acking, place, store }: ThreadReadOf): Read<ThreadMessagesState> {
  return readOf(store, store.threads.subscribeShowing(place, acking), threadOf(place));
}

function useRead<State>(read: Read<State>): State {
  return useSyncExternalStore(read.subscribe, read.snapshot);
}

function useListed<State>(listed: Listed, select: (state: BoardState) => State): State {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribeShowing(listed), () => select(store.snapshot()));
}

function useChannels(): ChannelsState {
  return useListed("channels", channelList);
}

function useDeletedChannelNotice(): ChannelName | null {
  return useListed("channels", deletedChannelNotice);
}

function useCommands(): CommandsState {
  return useListed("commands", commandList);
}

function useSubscriptions(): SubscriptionsState {
  return useListed("subscriptions", subscribedChannels);
}

function useChannelSchedules(channel: ChannelName): ListedSchedules {
  const select = useMemo(() => scheduleListOf(channel), [channel]);
  return useListed("schedules", select);
}

function useDeletedSchedules(): ReadonlySet<ScheduledMessageId> {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribe, () => deletedSchedules(store.snapshot()));
}

function useClosingRefusal(): ClosingRefusal | null {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribe, () => closingRefusal(store.snapshot()));
}

function useSearchResults(ids: readonly MessageId[]): readonly SearchResult[] {
  const store = useBoardStore();
  const select = useMemo(() => searchResultsOf(ids), [ids]);
  return useSyncExternalStore(store.subscribe, () => select(store.snapshot()));
}

function useChannelPage(name: ChannelName): ChannelMessagesState {
  const store = useBoardStore();
  const read = useMemo(
    () => readOf(store, store.channelPages.subscribeShowing(name), channelPage(name)),
    [name, store],
  );
  return useRead(read);
}

function useChannelCalls(channel: ChannelName): ChannelCalls {
  const { channelPages } = useBoardStore();
  return useMemo(
    () => ({
      call: (command: string, data: string, called: () => void) => {
        channelPages.call(channel, { called, command, data });
      },
      editCallData: (data: string) => {
        channelPages.editCallData(channel, data);
      },
    }),
    [channel, channelPages],
  );
}

function useThreadRead({ acking, place: { channel, id } }: ThreadReading): Read<ThreadMessagesState> {
  const store = useBoardStore();
  return useMemo(() => threadRead({ acking, place: { channel, id }, store }), [acking, channel, id, store]);
}

function useShownThread(reading: ThreadReading): ShownThread {
  const read = useThreadRead(reading);
  return { closing: useBoardStore().calls, read, state: useRead(read) };
}

function useReply({ place: { channel, id }, replied }: Replying): (outgoing: Outgoing, posted: () => void) => void {
  const store = useBoardStore();
  return useCallback(
    (outgoing: Outgoing, posted: () => void) => {
      store.threads.reply(
        { channel, id },
        {
          ...outgoing,
          posted: () => {
            posted();
            if (replied !== null) {
              replied();
            }
          },
        },
      );
    },
    [channel, id, replied, store],
  );
}

function useMessageBefore({ channel, id }: ThreadPlace): MessageBeforeState {
  const store = useBoardStore();
  const read = useMemo(
    () => readOf(store, store.subscribeShowingBefore({ channel, id }), messageBeforeOf({ channel, id })),
    [channel, id, store],
  );
  return useRead(read);
}

export {
  BoardStoreContext,
  type Read,
  threadRead,
  useBoardStore,
  useChannelCalls,
  useChannelPage,
  useChannelSchedules,
  useChannels,
  useClosingRefusal,
  useCommands,
  useDeletedChannelNotice,
  useDeletedSchedules,
  useMessageBefore,
  useReply,
  useSearchResults,
  useShownThread,
  useSubscriptions,
  useThreadRead,
};

import type {
  Board,
  BoardSnapshot,
  BoardStore,
  ChannelMessages,
  MessageBefore,
  ThreadMessages,
} from "../../board/index.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { browserClock, browserTimeZone } from "../../format/index.ts";
import {
  channelList,
  channelPage,
  closingRefusal,
  commandList,
  createChannelCreation,
  createScheduling,
  deletedChannelNotice,
  messageBeforeOf,
  subscribedChannels,
  threadOf,
} from "../../board/index.ts";
import type { Stores } from "./stores.ts";

const NONE = 0;
const PREVIEW_PAUSE_MS = 200;

interface ThreadPlace {
  readonly channel: ChannelName;
  readonly id: MessageId;
}

function madeOnce<Key, Made>(keyOf: (key: Key) => string, make: (key: Key) => Made): (key: Key) => Made {
  const made = new Map<string, Made>();
  return (key) => {
    const found = made.get(keyOf(key)) ?? make(key);
    made.set(keyOf(key), found);
    return found;
  };
}

function placeKey({ channel, id }: ThreadPlace): string {
  return `${channel}/${String(id)}`;
}

function listBoardSnapshot(store: BoardStore): () => BoardSnapshot {
  const last: BoardSnapshot[] = [];
  return () => {
    const state = store.snapshot();
    const channels = channelList(state);
    const notice = deletedChannelNotice(state);
    const found = last.find((each) => each.channels === channels && each.notice === notice) ?? { channels, notice };
    last.splice(NONE, last.length, found);
    return found;
  };
}

function channelOf(store: BoardStore, name: ChannelName): ChannelMessages {
  const select = channelPage(name);
  const pages = store.channelPages;
  return {
    call: (command, data, called) => {
      pages.call(name, { called, command, data });
    },
    editCallData: (data) => {
      pages.editCallData(name, data);
    },
    loadOlder: () => {
      pages.loadOlder(name);
    },
    post: (text, posted) => {
      pages.post(name, { posted, text });
    },
    showClosed: (run, count) => {
      pages.showClosed(name, { count, run });
    },
    snapshot: () => select(store.snapshot()),
    subscribe: pages.subscribeShowing(name),
  };
}

function threadIn(store: BoardStore, place: ThreadPlace): ThreadMessages {
  const select = threadOf(place);
  const { threads } = store;
  return {
    ack: (id) => {
      threads.ack(place, id);
    },
    reply: (text, posted) => {
      threads.reply(place, { posted, text });
    },
    snapshot: () => select(store.snapshot()),
    subscribe: threads.subscribeShowing(place, true),
    subscribeWithoutAcking: threads.subscribeShowing(place, false),
  };
}

function beforeIn(store: BoardStore, place: ThreadPlace): MessageBefore {
  const select = messageBeforeOf(place);
  return { snapshot: () => select(store.snapshot()), subscribe: store.subscribeShowingBefore(place) };
}

function createBoard(store: BoardStore): Board {
  const channels = madeOnce(String, (name: ChannelName) => channelOf(store, name));
  const threads = madeOnce(placeKey, (place: ThreadPlace) => threadIn(store, place));
  return {
    ack: store.calls.ack,
    channel: channels,
    closing: {
      close: store.calls.close,
      refusal: () => closingRefusal(store.snapshot()),
      reopen: store.calls.reopen,
      subscribe: store.subscribe,
    },
    commands: {
      snapshot: () => commandList(store.snapshot()),
      subscribe: store.subscribeShowing("commands"),
    },
    creation: createChannelCreation({ createChannel: store.calls.createChannel }),
    dismissNotice: store.dismissNotice,
    messageBefore: madeOnce(placeKey, (place: ThreadPlace) => beforeIn(store, place)),
    scheduling: createScheduling({
      clock: browserClock,
      create: store.calls.createScheduledMessage,
      pause: PREVIEW_PAUSE_MS,
      preview: store.calls.previewScheduledMessage,
      timeZone: browserTimeZone(),
    }),
    snapshot: listBoardSnapshot(store),
    subscribe: store.subscribeShowing("channels"),
    subscriptions: {
      setSubscribed: store.calls.setSubscribed,
      snapshot: () => subscribedChannels(store.snapshot()),
      subscribe: store.subscribeShowing("subscriptions"),
    },
    thread: (channel, id) => threads({ channel, id }),
  };
}

const boards = new WeakMap<BoardStore, Board>();

const made = new WeakMap<Omit<Stores, "board">, Stores>();

function boardFor(store: BoardStore): Board {
  const board = boards.get(store) ?? createBoard(store);
  boards.set(store, board);
  return board;
}

function withBoard(stores: Omit<Stores, "board">): Stores {
  const found = made.get(stores) ?? { ...stores, board: boardFor(stores.boardStore) };
  made.set(stores, found);
  return found;
}

export { withBoard };

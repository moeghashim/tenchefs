import type { AskedFrom, SubscriptionsState } from "./subscriptions-slice.ts";
import type { ChannelMessagesState, MessageBeforeState, ThreadMessagesState } from "./message-selectors.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ChannelsState, CommandsState } from "./listed-slices.ts";
import type { ChannelCreation } from "./channel-creation.ts";
import type { ClosingRefusal } from "./thread-closing.ts";
import type { Scheduling } from "./scheduling.ts";
import type { ThreadPlace } from "./threads-part.ts";

type Subscribe = (listener: () => void) => () => void;

interface BoardSnapshot {
  readonly channels: ChannelsState;
  readonly notice: ChannelName | null;
}

interface ChannelMessages {
  readonly subscribe: Subscribe;
  readonly snapshot: () => ChannelMessagesState;
  readonly loadOlder: () => void;
  readonly call: (command: string, data: string, called: () => void) => void;
  readonly editCallData: (data: string) => void;
  readonly post: (text: string, posted: () => void) => void;
  readonly showClosed: (run: readonly MessageId[], count: number) => void;
}

interface ThreadMessages {
  readonly subscribe: Subscribe;
  readonly snapshot: () => ThreadMessagesState;
  readonly reply: (text: string, posted: () => void) => void;
  readonly subscribeWithoutAcking: Subscribe;
  readonly ack: (id: MessageId) => void;
}

interface Commands {
  readonly subscribe: Subscribe;
  readonly snapshot: () => CommandsState;
}

interface Subscriptions {
  readonly subscribe: Subscribe;
  readonly snapshot: () => SubscriptionsState;
  readonly setSubscribed: (channel: ChannelName, subscribed: boolean, from: AskedFrom) => void;
}

interface ThreadClosing {
  readonly subscribe: Subscribe;
  readonly refusal: () => ClosingRefusal | null;
  readonly close: (messageId: MessageId) => void;
  readonly reopen: (messageId: MessageId) => void;
}

interface MessageBefore {
  readonly subscribe: Subscribe;
  readonly snapshot: () => MessageBeforeState;
}

interface Board {
  readonly subscribe: Subscribe;
  readonly snapshot: () => BoardSnapshot;
  readonly channel: (name: ChannelName) => ChannelMessages;
  readonly thread: (channel: ChannelName, id: MessageId) => ThreadMessages;
  readonly commands: Commands;
  readonly subscriptions: Subscriptions;
  readonly creation: ChannelCreation;
  readonly scheduling: Scheduling;
  readonly closing: ThreadClosing;
  readonly messageBefore: (at: ThreadPlace) => MessageBefore;
  readonly ack: (id: MessageId) => void;
  readonly dismissNotice: () => void;
}

export type {
  Board,
  BoardSnapshot,
  ChannelMessages,
  Commands,
  MessageBefore,
  Subscriptions,
  ThreadClosing,
  ThreadMessages,
};

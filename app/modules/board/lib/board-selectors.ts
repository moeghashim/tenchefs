import type { ChannelMessagesState, MessageBeforeState, ThreadMessagesState } from "./message-selectors.ts";
import type { ChannelsState, CommandsState } from "./listed-slices.ts";
import { channelMessages, messageBefore, threadMessages } from "./message-selectors.ts";
import type { BoardState } from "./board-store.ts";
import type { ChannelName } from "../../sdk/index.ts";
import type { ClosingRefusal } from "./thread-closing.ts";
import type { SubscriptionsState } from "./subscriptions-slice.ts";
import type { ThreadPlace } from "./threads-part.ts";

function channelList(state: BoardState): ChannelsState {
  return state.channels;
}

function deletedChannelNotice(state: BoardState): ChannelName | null {
  return state.notice;
}

function commandList(state: BoardState): CommandsState {
  return state.commands;
}

function subscribedChannels(state: BoardState): SubscriptionsState {
  return state.subscriptions;
}

function closingRefusal(state: BoardState): ClosingRefusal | null {
  return state.closingRefusal;
}

function channelPage(name: ChannelName): (state: BoardState) => ChannelMessagesState {
  const select = channelMessages(name);
  return (state) => select(state.messages);
}

function threadOf(place: ThreadPlace): (state: BoardState) => ThreadMessagesState {
  const select = threadMessages(place);
  return (state) => select(state.messages);
}

function messageBeforeOf(place: ThreadPlace): (state: BoardState) => MessageBeforeState {
  const select = messageBefore(place);
  return (state) => select(state.messages);
}

export {
  channelList,
  channelPage,
  closingRefusal,
  commandList,
  deletedChannelNotice,
  messageBeforeOf,
  subscribedChannels,
  threadOf,
};

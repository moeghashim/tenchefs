import type { ChannelMessagesState, MessageBeforeState, ThreadMessagesState } from "./message-selectors.ts";
import type { ChannelName, ScheduledMessageId } from "../../sdk/index.ts";
import type { ChannelsState, CommandsState } from "./listed-slices.ts";
import { channelMessages, messageBefore, threadMessages } from "./message-selectors.ts";
import type { BoardState } from "./board-store.ts";
import type { ClosingRefusal } from "./thread-closing.ts";
import type { ListedSchedules } from "./schedules-slice.ts";
import type { MessageDeleting } from "./message-deleting.ts";
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

function scheduleListOf(channel: ChannelName): (state: BoardState) => ListedSchedules {
  let read: ListedSchedules | null = null;
  let shown: ListedSchedules = { status: "loading" };
  return (state) => {
    const { listed } = state.schedules;
    if (listed === read) {
      return shown;
    }
    read = listed;
    if (listed.status !== "loaded") {
      shown = listed;
      return shown;
    }
    shown = { schedules: listed.schedules.filter((schedule) => schedule.channel === channel), status: "loaded" };
    return shown;
  };
}

function deletedSchedules(state: BoardState): ReadonlySet<ScheduledMessageId> {
  return state.schedules.deleted;
}

function closingRefusal(state: BoardState): ClosingRefusal | null {
  return state.closingRefusal;
}

function messageDeleting(state: BoardState): MessageDeleting {
  return state.messageDeleting;
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
  deletedSchedules,
  messageBeforeOf,
  messageDeleting,
  scheduleListOf,
  subscribedChannels,
  threadOf,
};

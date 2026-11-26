import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ChannelsState, CommandsState } from "./listed-slices.ts";
import type { OwnClient, OwnParts, Schedules } from "./own-parts.ts";
import type { BoardCalls } from "./board-calls.ts";
import type { ChannelPages } from "./channel-pages.ts";
import type { ClosingRefusal } from "./thread-closing.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { ReplyRequest } from "./thread-reads.ts";
import type { SubscriptionsState } from "./subscriptions-slice.ts";
import type { ThreadPlace } from "./threads-part.ts";
import { createOwnParts } from "./own-parts.ts";

type Subscribe = (listener: () => void) => () => void;

interface ChannelPageCalls extends Omit<ChannelPages, "back" | "heard" | "show"> {
  readonly subscribeShowing: (name: ChannelName) => Subscribe;
}

interface ThreadCalls {
  readonly subscribeShowing: (place: ThreadPlace, acking: boolean) => Subscribe;
  readonly reply: (place: ThreadPlace, request: ReplyRequest) => void;
  readonly ack: (place: ThreadPlace, id: MessageId) => void;
}

type OwnShown = "channels" | "commands" | "schedules" | "subscriptions";

interface OwnShowing {
  readonly channelPages: ChannelPageCalls;
  readonly threads: ThreadCalls;
  readonly subscribeShowingBefore: (place: ThreadPlace) => Subscribe;
  readonly calls: BoardCalls;
  readonly dismissNotice: () => void;
}

interface OwnState {
  readonly channels: ChannelsState;
  readonly notice: ChannelName | null;
  readonly commands: CommandsState;
  readonly schedules: Schedules;
  readonly subscriptions: SubscriptionsState;
  readonly messages: MessagesHeld;
  readonly closingRefusal: ClosingRefusal | null;
  readonly messageDeleting: ReturnType<BoardCalls["deleting"]>;
}

interface Following {
  readonly follow: () => void;
  readonly subscribe: Subscribe;
}

interface Own {
  readonly parts: OwnParts;
  readonly state: () => OwnState;
  readonly subscribers: (following: Following) => Readonly<Record<OwnShown, Subscribe>>;
  readonly showing: (following: Following) => OwnShowing;
}

interface OwnOptions {
  readonly client: OwnClient;
  readonly pageSize: number;
  readonly changed: () => void;
}

function followedBy({ follow, subscribe }: Following, show: (listener: () => void) => () => void): Subscribe {
  return (listener) => {
    follow();
    const unsubscribe = subscribe(listener);
    const hide = show(listener);
    return () => {
      unsubscribe();
      hide();
    };
  };
}

interface Shown {
  readonly show: () => void;
  readonly hide: () => void;
}

function showingPart(following: Following, part: Shown): Subscribe {
  return followedBy(following, () => {
    part.show();
    return part.hide;
  });
}

function showingOf(own: OwnParts, following: Following): OwnShowing {
  const { messages } = own;
  const { pages, threads } = messages;
  return {
    calls: own.calls,
    channelPages: {
      call: pages.call,
      editCallData: pages.editCallData,
      loadOlder: pages.loadOlder,
      post: pages.post,
      showClosed: pages.showClosed,
      subscribeShowing: (name) => followedBy(following, () => pages.show(name)),
    },
    dismissNotice: own.dismissNotice,
    subscribeShowingBefore: (place) => followedBy(following, () => messages.showBefore(place)),
    threads: {
      ack: threads.ack,
      reply: threads.reply,
      subscribeShowing: (place, acking) =>
        followedBy(following, (listener) => threads.show(place, { acking, listener })),
    },
  };
}

function createOwn(options: OwnOptions): Own {
  const parts = createOwnParts(options);
  return {
    parts,
    showing: (following) => showingOf(parts, following),
    state: () => ({
      channels: parts.channels.state(),
      closingRefusal: parts.calls.closingRefusal(),
      commands: parts.commands.state(),
      messageDeleting: parts.calls.deleting(),
      messages: parts.messages.state(),
      notice: parts.notice(),
      schedules: parts.schedules.state(),
      subscriptions: parts.subscriptions.state(),
    }),
    subscribers: (following) => ({
      channels: showingPart(following, parts.channels),
      commands: showingPart(following, parts.commands),
      schedules: showingPart(following, parts.schedules),
      subscriptions: showingPart(following, parts.subscriptions),
    }),
  };
}

export type { OwnClient } from "./own-parts.ts";
export { type OwnShowing, type OwnState, createOwn };

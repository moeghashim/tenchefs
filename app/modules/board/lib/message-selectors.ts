import type { ChannelName, Message, MessageId, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { Failure, PostState } from "./failure.ts";
import type { PageLoaded, ReadState, ThreadLoaded } from "./message-states.ts";
import type { CallState } from "./webhook-command-call.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { ThreadPlace } from "./threads-part.ts";
import { beforeKey } from "./messages-part.ts";
import { heldTopLevel } from "./messages-table.ts";
import { threadKey } from "./threads-part.ts";

const LOADING = { status: "loading" } as const;

const NONE = 0;

interface ChannelLoaded extends Omit<PageLoaded, "ids"> {
  readonly messages: readonly TopLevelMessage[];
  readonly receipts: readonly ReadReceipt[];
}

type ChannelMessagesState = { readonly status: "loading" } | Failure | ChannelLoaded;

interface ThreadMessagesLoaded {
  readonly status: "loaded";
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
  readonly receipts: readonly ReadReceipt[];
  readonly read: ReadState;
  readonly reply: PostState;
  readonly call: CallState;
  readonly callData: string;
  readonly deleted: ReadonlySet<MessageId>;
}

type ThreadMessagesState = { readonly status: "loading" } | Failure | ThreadMessagesLoaded;

type MessageBeforeState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly message: TopLevelMessage | null; readonly receipts: readonly ReadReceipt[] }
  | Failure;

function sameItems<Item>(one: readonly Item[], other: readonly Item[]): boolean {
  return one.length === other.length && one.every((item, index) => item === other[index]);
}

function keptList<Item>(): (next: readonly Item[]) => readonly Item[] {
  let last: readonly Item[] = [];
  return (next) => {
    if (!sameItems(last, next)) {
      last = next;
    }
    return last;
  };
}

function isTopLevel(message: Message | undefined): message is TopLevelMessage {
  return typeof message === "object" && message.kind === "top-level";
}

function isReply(message: Message | undefined): message is Reply {
  return typeof message === "object" && message.kind === "reply";
}

function topLevelOf(held: MessagesHeld, ids: readonly MessageId[]): readonly TopLevelMessage[] {
  return ids.map((id) => held.table.get(id)).filter((message) => isTopLevel(message));
}

function repliesOf(held: MessagesHeld, ids: readonly MessageId[]): readonly Reply[] {
  return ids.map((id) => held.table.get(id)).filter((message) => isReply(message));
}

function receiptsOf(held: MessagesHeld, messages: readonly Message[]): readonly ReadReceipt[] {
  return messages.flatMap((message) => held.receipts.get(message.id) ?? []);
}

interface Made<Answer> {
  readonly parts: readonly unknown[];
  readonly answer: Answer;
}

function kept<Answer>(): (parts: readonly unknown[], make: () => Answer) => Answer {
  const last: Made<Answer>[] = [];
  return (parts, make) => {
    const found = last.find((each) => sameItems(each.parts, parts)) ?? { answer: make(), parts };
    last.splice(NONE, last.length, found);
    return found.answer;
  };
}

function channelMessages(name: ChannelName): (held: MessagesHeld) => ChannelMessagesState {
  const messagesKept = keptList<TopLevelMessage>();
  const receiptsKept = keptList<ReadReceipt>();
  const answer = kept<ChannelMessagesState>();
  return (held) => {
    const page = held.pages.get(name) ?? LOADING;
    if (page.status !== "loaded") {
      return page;
    }
    const { ids, ...rest } = page;
    const messages = messagesKept(topLevelOf(held, ids));
    const receipts = receiptsKept(receiptsOf(held, messages));
    return answer([page, messages, receipts], () => ({ ...rest, messages, receipts }));
  };
}

function threadAnswer(held: MessagesHeld, thread: ThreadLoaded): ThreadMessagesLoaded | null {
  const parent = heldTopLevel({ held, id: thread.parent });
  if (parent === null) {
    return null;
  }
  const { call, callData, deleted, read, reply } = thread;
  const replies = repliesOf(held, thread.replies);
  return { call, callData, deleted, parent, read, receipts: [], replies, reply, status: "loaded" };
}

function threadMessages(place: ThreadPlace): (held: MessagesHeld) => ThreadMessagesState {
  const key = threadKey(place);
  const repliesKept = keptList<Reply>();
  const receiptsKept = keptList<ReadReceipt>();
  const answer = kept<ThreadMessagesState>();
  return (held) => {
    const thread = held.threads.get(key) ?? LOADING;
    if (thread.status !== "loaded") {
      return thread;
    }
    const made = threadAnswer(held, thread);
    if (made === null) {
      return LOADING;
    }
    const replies = repliesKept(made.replies);
    const receipts = receiptsKept(receiptsOf(held, [made.parent, ...replies]));
    return answer([thread, made.parent, replies, receipts], () => ({ ...made, receipts, replies }));
  };
}

interface Placed {
  readonly held: MessagesHeld;
  readonly id: MessageId | null;
}

function heldBefore({ held, id }: Placed): TopLevelMessage | null {
  if (id === null) {
    return null;
  }
  return heldTopLevel({ held, id });
}

function receiptsOfHeld(held: MessagesHeld, message: TopLevelMessage | null): readonly ReadReceipt[] {
  if (message === null) {
    return [];
  }
  return held.receipts.get(message.id) ?? [];
}

function messageBefore(place: ThreadPlace): (held: MessagesHeld) => MessageBeforeState {
  const key = beforeKey(place);
  const answer = kept<MessageBeforeState>();
  return (held) => {
    const before = held.before.get(key) ?? LOADING;
    if (before.status !== "loaded") {
      return before;
    }
    const message = heldBefore({ held, id: before.id });
    const receipts = receiptsOfHeld(held, message);
    return answer([before, message, ...receipts], () => ({ message, receipts, status: "loaded" }));
  };
}

export {
  type ChannelMessagesState,
  type MessageBeforeState,
  type ThreadMessagesState,
  channelMessages,
  messageBefore,
  threadMessages,
};

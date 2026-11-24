import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { isChannelName } from "../../channels/index.ts";
import { isMessageId } from "../../messages/index.ts";

const DIGITS = /^\d+$/u;

interface ThreadSelection {
  readonly channel: ChannelName;
  readonly thread: MessageId;
}

interface InboxThreadSelection extends ThreadSelection {
  readonly message?: MessageId;
}

type InboxSelection = InboxThreadSelection | { readonly channel: ChannelName; readonly thread: null };

interface ThreadText {
  readonly channel: string;
  readonly thread: string;
}

function messageIdOf(text: string): MessageId | null {
  const id = Number(text);
  if (!DIGITS.test(text) || !isMessageId(id)) {
    return null;
  }
  return id;
}

function selectionOf({ channel, thread }: ThreadText): ThreadSelection | null {
  const id = messageIdOf(thread);
  if (!isChannelName(channel) || id === null) {
    return null;
  }
  return { channel, thread: id };
}

function inboxHref(selected: InboxSelection | null): string {
  if (selected === null) {
    return "#/inbox";
  }
  if (selected.thread === null) {
    return `#/inbox/${selected.channel}`;
  }
  const thread = `#/inbox/${selected.channel}/${String(selected.thread)}`;
  if (typeof selected.message !== "number") {
    return thread;
  }
  return `${thread}/messages/${String(selected.message)}`;
}

export { type InboxSelection, type InboxThreadSelection, type ThreadSelection, inboxHref, messageIdOf, selectionOf };

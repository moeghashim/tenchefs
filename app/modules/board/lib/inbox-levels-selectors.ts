import type { ChannelName, InboxItem, MessageId } from "../../sdk/index.ts";
import type { ThreadNews, UnreadCounts } from "./inbox-levels.ts";
import { countsByChannel, countsOf, newsByThread, threadsWithNews } from "./inbox-levels.ts";
import { inboxMovesBack, inboxOf, inboxReadPosition } from "./inbox-selectors.ts";
import type { InboxRow } from "./inbox-rows.ts";
import type { InboxShowing } from "./inbox-selectors.ts";
import { rowsOf } from "./inbox-rows.ts";

const NONE = 0;
const BEFORE_EVERY_MESSAGE = 0;
const NO_ITEMS: readonly InboxItem[] = [];

interface Looking {
  readonly state: InboxShowing;
  readonly me: string;
}

interface InChannel {
  readonly state: InboxShowing;
  readonly channel: ChannelName;
}

interface AtPlace extends InChannel {
  readonly thread: MessageId | null;
}

function keptBy<Arg, Out>(
  compute: (items: readonly InboxItem[], arg: Arg) => Out,
): (items: readonly InboxItem[], arg: Arg) => Out {
  const kept = new WeakMap<readonly InboxItem[], Map<Arg, { readonly out: Out }>>();
  return (items, arg) => {
    const byArg = kept.get(items) ?? new Map<Arg, { readonly out: Out }>();
    kept.set(items, byArg);
    const held = byArg.get(arg) ?? null;
    if (held !== null) {
      return held.out;
    }
    const out = compute(items, arg);
    byArg.set(arg, { out });
    return out;
  };
}

function unreadItems(state: InboxShowing): readonly InboxItem[] {
  const inbox = inboxOf(state);
  if (inbox.status !== "loaded") {
    return NO_ITEMS;
  }
  return inbox.items;
}

const rowsKept = keptBy((items, me: string) => rowsOf({ items, me }));
const countsKept = keptBy((items, me: string) => countsOf({ items, me }));
const byChannelKept = keptBy((items, me: string) => countsByChannel({ items, me }));
const newsKept = keptBy((items, me: string) => newsByThread({ items, me }));
const threadsKept = keptBy((items, channel: ChannelName) => threadsWithNews({ channel, items }));

function inboxRows({ me, state }: Looking): readonly InboxRow[] {
  return rowsKept(unreadItems(state), me);
}

function inboxCounts({ me, state }: Looking): UnreadCounts {
  return countsKept(unreadItems(state), me);
}

function inboxForYou({ me, state }: Looking): number {
  const inbox = inboxOf(state);
  if (inbox.status !== "loaded") {
    return NONE;
  }
  return (
    countsKept(inbox.items, me).forYou +
    inbox.alerts.length +
    inbox.nudges.length +
    inbox.deactivationOffers.length +
    inbox.deactivatedQuietAgents.length +
    inbox.agentJoinRequests.length
  );
}

function inboxCountsByChannel({ me, state }: Looking): ReadonlyMap<ChannelName, UnreadCounts> {
  return byChannelKept(unreadItems(state), me);
}

function inboxNewsByThread({ me, state }: Looking): ReadonlyMap<MessageId, ThreadNews> {
  return newsKept(unreadItems(state), me);
}

function inboxThreadsWithNews({ channel, state }: InChannel): readonly MessageId[] | null {
  if (inboxOf(state).status !== "loaded") {
    return null;
  }
  return threadsKept(unreadItems(state), channel);
}

function inboxNewLine({ channel, state, thread }: AtPlace): MessageId | number | null {
  if (inboxOf(state).status !== "loaded") {
    return null;
  }
  const position = inboxReadPosition({ channel, state, thread });
  if (position === null && inboxMovesBack({ channel, state, thread }) > NONE) {
    return BEFORE_EVERY_MESSAGE;
  }
  return position;
}

export {
  inboxCounts,
  inboxCountsByChannel,
  inboxForYou,
  inboxNewLine,
  inboxNewsByThread,
  inboxRows,
  inboxThreadsWithNews,
};

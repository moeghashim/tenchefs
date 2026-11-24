import type { ChannelName, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { Unread, UnreadState } from "../../unread/index.ts";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ChannelMessagesState } from "../../board/index.ts";
import { threadsWithNews } from "../../unread/index.ts";

const HIGHLIGHT_MS = 2000;
const NO_THREADS: readonly MessageId[] = [];

interface Holding {
  readonly channel: ChannelName;
  readonly state: ChannelMessagesState;
  readonly unread: Unread;
}

interface Kept {
  readonly held: ReadonlySet<MessageId>;
  readonly decided: boolean;
  readonly target: MessageId | null;
}

interface HeldThreads {
  readonly held: ReadonlySet<MessageId>;
  readonly highlighted: MessageId | null;
}

interface Seen {
  readonly kept: Kept;
  readonly news: readonly MessageId[] | null;
  readonly messages: readonly TopLevelMessage[] | null;
}

function newsOf(state: UnreadState, channel: ChannelName): readonly MessageId[] | null {
  if (state.status !== "loaded") {
    return null;
  }
  return threadsWithNews({ channel, items: state.items });
}

function messagesOf(state: ChannelMessagesState): readonly TopLevelMessage[] | null {
  if (state.status !== "loaded") {
    return null;
  }
  return state.messages;
}

function targetOf(news: readonly MessageId[], messages: readonly TopLevelMessage[]): MessageId | null {
  const listed = messages.filter((message) => news.includes(message.id));
  const [first] = listed;
  if (typeof first !== "object" || !listed.some((message) => "closedAt" in message)) {
    return null;
  }
  return first.id;
}

function decided({ kept, messages, news }: Seen): Kept {
  if (kept.decided || news === null || messages === null) {
    return kept;
  }
  return { ...kept, decided: true, target: targetOf(news, messages) };
}

function grown(kept: Kept, news: readonly MessageId[]): Kept {
  if (news.every((id) => kept.held.has(id))) {
    return kept;
  }
  return { ...kept, held: new Set([...kept.held, ...news]) };
}

function shownOf(target: MessageId | null, faded: MessageId | null): MessageId | null {
  if (target === faded) {
    return null;
  }
  return target;
}

const FRESH: Kept = { decided: false, held: new Set(), target: null };

export function useHeldThreads({ channel, state, unread }: Holding): HeldThreads {
  const unreadState = useSyncExternalStore(unread.subscribe, unread.snapshot);
  const news = useMemo(() => newsOf(unreadState, channel), [unreadState, channel]);
  const [kept, setKept] = useState<Kept>(FRESH);
  const [faded, setFaded] = useState<MessageId | null>(null);
  const next = decided({ kept: grown(kept, news ?? NO_THREADS), messages: messagesOf(state), news });
  if (next !== kept) {
    setKept(next);
  }
  const highlighted = shownOf(next.target, faded);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setFaded((before) => highlighted ?? before);
    }, HIGHLIGHT_MS);
    return (): void => {
      globalThis.clearTimeout(timer);
    };
  }, [highlighted]);
  return { held: next.held, highlighted };
}

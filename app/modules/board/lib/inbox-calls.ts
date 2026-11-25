import type { AckAllRequest, ChannelName, MessageId, Refusal } from "../../sdk/index.ts";
import type { Calling, InboxCallsClient, InboxCallsState, JoinCalls, NoticeCalls } from "./inbox-notice-calls.ts";
import type { Change, InboxEntries, InboxEntry, InboxState } from "./inbox-entries.ts";
import { IDLE, earlierCalls, joinCalls, noticeCalls, queued } from "./inbox-notice-calls.ts";
import { failure } from "./failure.ts";
import { refusalOf } from "../../sdk/index.ts";

type MarkChannelRefusal = Refusal & { readonly channel: ChannelName };

interface InboxCalls extends NoticeCalls, JoinCalls {
  readonly markAllRead: () => void;
  readonly markChannelRead: (channel: ChannelName) => void;
  readonly markUnread: (messageId: MessageId) => void;
  readonly loadEarlier: () => void;
  readonly readAgain: () => void;
}

interface InboxCallsOptions {
  readonly client: InboxCallsClient;
  readonly pageSize: number;
  readonly held: () => InboxState;
  readonly apply: (change: Change) => void;
  readonly changed: () => void;
}

function newestOf<Id extends number, Entry extends { readonly id: Id }>(
  held: ReadonlyMap<Id, Entry>,
  open: (entry: Entry) => boolean,
): Id | null {
  let newest: Id | null = null;
  for (const entry of held.values()) {
    if (open(entry) && (newest === null || entry.id > newest)) {
      newest = entry.id;
    }
  }
  return newest;
}

function newestMessage(entries: InboxEntries): MessageId | null {
  const [newest = null] = [...entries.items.keys()].toSorted((first, second) => second - first);
  return newest;
}

function messagesUpTo(entries: InboxEntries): AckAllRequest {
  const upTo = newestMessage(entries);
  const alertsUpTo = newestOf(entries.alerts, ({ read }) => !read);
  return { ...(upTo !== null && { upTo }), ...(alertsUpTo !== null && { alertsUpTo }) };
}

function noticesUpTo(entries: InboxEntries): AckAllRequest {
  const nudgesUpTo = newestOf(entries.nudges, ({ read }) => !read);
  const deactivationOffersUpTo = newestOf(entries.deactivationOffers, ({ cleared }) => !cleared);
  const deactivatedQuietAgentsUpTo = newestOf(entries.deactivatedQuietAgents, ({ read }) => !read);
  return {
    ...(nudgesUpTo !== null && { nudgesUpTo }),
    ...(deactivationOffersUpTo !== null && { deactivationOffersUpTo }),
    ...(deactivatedQuietAgentsUpTo !== null && { deactivatedQuietAgentsUpTo }),
  };
}

function placeOf(entry: InboxEntry): string {
  if (entry.place.thread !== null) {
    return String(entry.place.thread);
  }
  return "channel";
}

function newestByPlace(entries: InboxEntries, channel: ChannelName): readonly MessageId[] {
  const newest = new Map<string, MessageId>();
  const items = [...entries.items.values()].toSorted((first, second) => first.message - second.message);
  for (const entry of items) {
    if (entry.channel.name === channel) {
      newest.set(placeOf(entry), entry.message);
    }
  }
  return [...newest.values()];
}

function markAll({ apply, client, held, put }: Calling): () => void {
  const after = queued();
  return () => {
    const request = { ...messagesUpTo(held().entries), ...noticesUpTo(held().entries) };
    after(async () => {
      put({ markAll: { status: "marking" } });
      try {
        const { alerts, readPositions } = await client.ackAll(request);
        apply({ alerts, readPositions, request, type: "inbox-acked-all" });
        put({ markAll: IDLE });
      } catch (error: unknown) {
        put({ markAll: failure(error) });
      }
    });
  };
}

function markChannel({ apply, client, held, put }: Calling): (channel: ChannelName) => void {
  const after = queued();
  async function ackOne(messageId: MessageId): Promise<Refusal | null> {
    try {
      const { readPosition } = await client.ack(messageId);
      apply({ readPositions: [readPosition], type: "positions-read" });
      return null;
    } catch (error: unknown) {
      return refusalOf(error);
    }
  }
  return (channel) => {
    const newest = newestByPlace(held().entries, channel);
    after(async () => {
      put({ markChannel: null });
      const refusals = await Promise.all(
        newest.map(async (messageId) => {
          const refused = await ackOne(messageId);
          return refused;
        }),
      );
      const refusal = refusals.find((each) => each !== null) ?? null;
      if (refusal !== null) {
        put({ markChannel: { ...refusal, channel } });
      }
    });
  };
}

function unreadCalls({ apply, client, put }: Calling): Pick<InboxCalls, "markUnread" | "readAgain"> {
  const after = queued();
  async function readAgain(): Promise<void> {
    const { items } = await client.inbox();
    apply({ items, type: "inbox-read-again" });
  }
  return {
    markUnread: (messageId) => {
      put({ menu: null });
      after(async () => {
        try {
          const { readPosition } = await client.markUnread(messageId);
          apply({ readPosition, type: "read-position-moved-back" });
        } catch (error: unknown) {
          put({ menu: refusalOf(error) });
          return;
        }
        await readAgain();
      });
    },
    readAgain: () => {
      after(readAgain);
    },
  };
}

const NO_INBOX_CALLS: InboxCallsState = { markAll: IDLE, markChannel: null, menu: null };

interface CreatedInboxCalls {
  readonly calls: InboxCalls;
  readonly state: () => InboxCallsState;
}

function createInboxCalls(options: InboxCallsOptions): CreatedInboxCalls {
  let state = NO_INBOX_CALLS;
  function put(next: Partial<InboxCallsState>): void {
    state = { ...state, ...next };
    options.changed();
  }
  const calling: Calling = { ...options, put };
  return {
    calls: {
      ...unreadCalls(calling),
      ...noticeCalls(calling),
      ...joinCalls(calling),
      loadEarlier: earlierCalls(calling),
      markAllRead: markAll(calling),
      markChannelRead: markChannel(calling),
    },
    state: () => state,
  };
}

export type { InboxCallsClient, InboxCallsState, MarkAllState } from "./inbox-notice-calls.ts";
export { type InboxCalls, type MarkChannelRefusal, createInboxCalls };

import type {
  ChannelName,
  CookoutClient,
  CookoutEvent,
  InboxHistoryNudge,
  MessageId,
  Nudge,
  NudgeId,
} from "../../sdk/index.ts";
import type { Notifier } from "./notifier.ts";
import { createNotifier } from "./notifier.ts";

type NudgesState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly nudges: readonly InboxHistoryNudge[] }
  | { readonly status: "failed" };

interface Nudges {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => NudgesState;
  readonly markRead: (id: NudgeId) => void;
  readonly close: (nudge: Nudge) => void;
}

interface LiveNudges extends Nudges {
  readonly addAll: (nudges: readonly InboxHistoryNudge[]) => void;
  readonly addUnread: (nudges: readonly Nudge[]) => void;
  readonly readUpTo: (id: NudgeId) => void;
  readonly receive: (event: CookoutEvent) => boolean;
  readonly unread: () => readonly Nudge[];
  readonly newestUnread: () => NudgeId | null;
  readonly forgetChannel: (channel: ChannelName) => void;
}

interface NudgesOptions {
  readonly client: Pick<CookoutClient, "closeThread" | "inboxHistory" | "markNudgeRead">;
  readonly onChange: (unread: readonly Nudge[]) => void;
}

interface Known {
  readonly addAll: (nudges: readonly InboxHistoryNudge[]) => void;
  readonly readWhere: (read: (nudge: InboxHistoryNudge) => boolean) => boolean;
  readonly dropWhere: (drop: (nudge: InboxHistoryNudge) => boolean) => void;
  readonly unread: () => readonly Nudge[];
  readonly historyRead: () => void;
}

const FIRST_PAGE = { limit: 1 } as const;
const NONE = 0;

function newestFirst(nudges: Iterable<InboxHistoryNudge>): readonly InboxHistoryNudge[] {
  return [...nudges].toSorted((first, second) => second.id - first.id);
}

function withoutRead({ read: _read, ...nudge }: InboxHistoryNudge): Nudge {
  return nudge;
}

function knownNudges(shown: Notifier<NudgesState>, onChange: NudgesOptions["onChange"]): Known {
  const known = new Map<NudgeId, InboxHistoryNudge>();
  let loaded = false;
  function unread(): readonly Nudge[] {
    return newestFirst(known.values())
      .filter(({ read }) => !read)
      .map((nudge) => withoutRead(nudge));
  }
  function addAll(nudges: readonly InboxHistoryNudge[]): void {
    for (const nudge of nudges) {
      known.set(nudge.id, nudge);
    }
    if (loaded) {
      shown.publish({ nudges: newestFirst(known.values()), status: "loaded" });
    }
    onChange(unread());
  }
  return {
    addAll,
    dropWhere: (drop) => {
      const dropped = [...known.values()].filter((nudge) => drop(nudge));
      for (const { id } of dropped) {
        known.delete(id);
      }
      addAll([]);
    },
    historyRead: () => {
      loaded = true;
    },
    readWhere: (read) => {
      const turned = [...known.values()].filter((nudge) => !nudge.read && read(nudge));
      addAll(turned.map((nudge) => ({ ...nudge, read: true })));
      return turned.length > NONE;
    },
    unread,
  };
}

function newestIdOf(nudges: readonly Nudge[]): NudgeId | null {
  const [newest = null] = nudges;
  if (newest === null) {
    return null;
  }
  return newest.id;
}

function threadOf(event: CookoutEvent): MessageId | null {
  if (event.type === "thread" && typeof event.parent.closedAt === "string") {
    return event.parent.id;
  }
  if (event.type === "message" && event.message.kind === "reply") {
    return event.message.replyTo;
  }
  return null;
}

function receiveIn(known: Known, event: CookoutEvent): boolean {
  if (event.type === "nudge") {
    known.addAll([{ ...event.nudge, read: false }]);
    return true;
  }
  if (event.type === "nudge-read") {
    const read = new Set(event.nudgeIds);
    return known.readWhere(({ id }) => read.has(id));
  }
  const thread = threadOf(event);
  if (thread === null) {
    return false;
  }
  return known.readWhere(({ parent }) => parent.id === thread);
}

interface Changes {
  readonly close: (nudge: Nudge) => void;
  readonly markRead: (id: NudgeId) => void;
}

function readThread(known: Known, thread: MessageId): void {
  known.readWhere(({ parent }) => parent.id === thread);
}

function changesOf(client: NudgesOptions["client"], known: Known): Changes {
  let changing: Promise<void> = Promise.resolve();

  async function after(previous: Promise<void>, change: () => Promise<void>): Promise<void> {
    await previous;
    try {
      await change();
    } catch {
      known.addAll([]);
    }
  }

  return {
    close: ({ parent }) => {
      changing = after(changing, async () => {
        await client.closeThread(parent.id);
        readThread(known, parent.id);
      });
    },
    markRead: (id) => {
      changing = after(changing, async () => {
        const { nudge } = await client.markNudgeRead(id);
        known.addAll([nudge]);
      });
    },
  };
}

function createNudges({ client, onChange }: NudgesOptions): LiveNudges {
  const shown = createNotifier<NudgesState>({ status: "loading" });
  const known = knownNudges(shown, onChange);
  let loading: Promise<void> | null = null;

  async function readHistory(): Promise<void> {
    try {
      const { nudges } = await client.inboxHistory(FIRST_PAGE);
      known.historyRead();
      known.addAll(nudges);
    } catch {
      shown.publish({ status: "failed" });
    }
  }

  return {
    ...changesOf(client, known),
    addAll: known.addAll,
    addUnread: (nudges) => {
      known.addAll(nudges.map((nudge) => ({ ...nudge, read: false })));
    },
    forgetChannel: (name) => {
      known.dropWhere(({ channel }) => channel.name === name);
    },
    newestUnread: () => newestIdOf(known.unread()),
    readUpTo: (id) => {
      known.readWhere((nudge) => nudge.id <= id);
    },
    receive: (event) => receiveIn(known, event),
    snapshot: shown.current,
    subscribe: (listener) => {
      loading ??= readHistory();
      return shown.subscribe(listener);
    },
    unread: known.unread,
  };
}

export { type LiveNudges, type Nudges, type NudgesState, createNudges };

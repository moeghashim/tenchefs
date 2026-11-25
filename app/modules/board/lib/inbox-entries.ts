import type {
  AckAllRequest,
  CookoutEvent,
  DeactivatedQuietAgent,
  DeactivatedQuietAgentId,
  DeactivationOffer,
  DeactivationOfferId,
  InboxAgentJoinRequest,
  InboxHistoryItem,
  InboxHistoryNudge,
  InboxItem,
  MessageId,
  NudgeId,
  OfflineAlert,
  OfflineAlertId,
  ReadPosition,
  Refusal,
} from "../../sdk/index.ts";
import type { Place, ReadPositions } from "./read-positions-slice.ts";
import type { Failure } from "./failure.ts";
import { placeOfMessage } from "./read-positions-slice.ts";

type InboxEntry = Omit<InboxItem, "message" | "parent"> & {
  readonly message: MessageId;
  readonly parent: MessageId;
  readonly place: Place;
};

type Loaded = { readonly status: "loading" } | { readonly status: "loaded" } | Failure;

type MoreState = { readonly status: "idle" } | { readonly status: "loading" } | Failure;

interface EarlierHeld {
  readonly status: Loaded;
  readonly read: ReadonlyMap<MessageId, InboxEntry>;
  readonly hasMore: boolean;
  readonly oldest: MessageId | null;
  readonly more: MoreState;
}

interface InboxEntries {
  readonly inbox: Loaded;
  readonly history: Loaded;
  readonly items: ReadonlyMap<MessageId, InboxEntry>;
  readonly alerts: ReadonlyMap<OfflineAlertId, OfflineAlert>;
  readonly nudges: ReadonlyMap<NudgeId, InboxHistoryNudge>;
  readonly deactivationOffers: ReadonlyMap<DeactivationOfferId, DeactivationOffer>;
  readonly deactivatedQuietAgents: ReadonlyMap<DeactivatedQuietAgentId, DeactivatedQuietAgent>;
  readonly held: ReadonlySet<DeactivatedQuietAgentId>;
  readonly agentJoinRequests: readonly InboxAgentJoinRequest[];
  readonly refusedJoins: ReadonlyMap<string, Refusal>;
  readonly earlier: EarlierHeld;
}

interface InboxState {
  readonly readPositions: ReadPositions;
  readonly entries: InboxEntries;
}

type InboxChange =
  | { readonly type: "inbox-read-again"; readonly items: readonly InboxItem[] }
  | { readonly type: "positions-read"; readonly readPositions: readonly ReadPosition[] }
  | {
      readonly type: "inbox-acked-all";
      readonly request: AckAllRequest;
      readonly readPositions: readonly ReadPosition[];
      readonly alerts: readonly OfflineAlert[];
    }
  | { readonly type: "quiet-agent-held"; readonly id: DeactivatedQuietAgentId; readonly held: boolean }
  | { readonly type: "agent-join-answered"; readonly userCode: string; readonly refusal: Refusal | null }
  | { readonly type: "earlier-more"; readonly more: MoreState }
  | {
      readonly type: "earlier-page";
      readonly items: readonly InboxHistoryItem[];
      readonly hasMore: boolean;
      readonly oldest: MessageId | null;
    };

type Change = CookoutEvent | InboxChange;

interface Applying {
  readonly entries: InboxEntries;
  readonly change: Change;
  readonly positions: ReadPositions;
}

const NONE = 0;
const LOADING = { status: "loading" } as const;
const IDLE = { status: "idle" } as const;

const NO_EARLIER: EarlierHeld = { hasMore: true, more: IDLE, oldest: null, read: new Map(), status: LOADING };

const NO_ENTRIES: InboxEntries = {
  agentJoinRequests: [],
  alerts: new Map(),
  deactivatedQuietAgents: new Map(),
  deactivationOffers: new Map(),
  earlier: NO_EARLIER,
  held: new Set(),
  history: LOADING,
  inbox: LOADING,
  items: new Map(),
  nudges: new Map(),
  refusedJoins: new Map(),
};

function entryOf({ message, parent, ...rest }: InboxItem): InboxEntry {
  return { ...rest, message: message.id, parent: parent.id, place: placeOfMessage(message) };
}

interface Pair {
  readonly one: unknown;
  readonly other: unknown;
}

function same({ one, other }: Pair): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}

interface Adding<Id extends number, Entry extends { readonly id: Id }> {
  readonly held: ReadonlyMap<Id, Entry>;
  readonly entries: readonly Entry[];
}

function withAll<Id extends number, Entry extends { readonly id: Id }>({
  entries,
  held,
}: Adding<Id, Entry>): ReadonlyMap<Id, Entry> {
  const changed = entries.filter((entry) => !same({ one: held.get(entry.id), other: entry }));
  if (changed.length === NONE) {
    return held;
  }
  const next = new Map(held);
  for (const entry of changed) {
    next.set(entry.id, entry);
  }
  return next;
}

interface Removing<Key, Entry> {
  readonly held: ReadonlyMap<Key, Entry>;
  readonly gone: (entry: Entry, key: Key) => boolean;
}

function withoutWhere<Key, Entry>({ gone, held }: Removing<Key, Entry>): ReadonlyMap<Key, Entry> {
  const keys: Key[] = [];
  for (const [key, entry] of held) {
    if (gone(entry, key)) {
      keys.push(key);
    }
  }
  if (keys.length === NONE) {
    return held;
  }
  const next = new Map(held);
  for (const key of keys) {
    next.delete(key);
  }
  return next;
}

interface Parting<Key extends keyof InboxEntries> {
  readonly entries: InboxEntries;
  readonly key: Key;
  readonly value: InboxEntries[Key];
}

function withPart<Key extends keyof InboxEntries>({ entries, key, value }: Parting<Key>): InboxEntries {
  if (entries[key] === value) {
    return entries;
  }
  return { ...entries, [key]: value };
}

export {
  type Applying,
  type Change,
  type EarlierHeld,
  type InboxChange,
  type InboxEntries,
  type InboxEntry,
  type InboxState,
  type Loaded,
  NO_ENTRIES,
  entryOf,
  same,
  withAll,
  withPart,
  withoutWhere,
};

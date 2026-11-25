import type {
  CookoutClient,
  InboxHistoryItem,
  InboxHistoryQuery,
  InboxHistoryResponse,
  InboxResponse,
  ReadPositionsResponse,
} from "../../sdk/index.ts";
import type { EarlierHeld, InboxEntries, InboxState, Loaded } from "./inbox-entries.ts";
import { LOADED, withHistoryNotices, withInbox } from "./inbox-merge.ts";
import { earlierWithPage } from "./inbox-items-applied.ts";
import { failure } from "./failure.ts";

type InboxClient = Pick<CookoutClient, "inbox" | "inboxHistory" | "readPositions">;

interface InboxReading {
  readonly client: InboxClient;
  readonly pageSize: number;
}

type Settled<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: unknown };

async function settled<Value>(asked: Promise<Value>): Promise<Settled<Value>> {
  try {
    return { ok: true, value: await asked };
  } catch (error: unknown) {
    return { error, ok: false };
  }
}

function heldOr(held: Loaded, error: unknown): Loaded {
  if (held.status === "loaded") {
    return held;
  }
  return failure(error);
}

interface Oldest {
  readonly items: readonly InboxHistoryItem[];
  readonly held: EarlierHeld["oldest"];
}

function oldestOf({ held, items }: Oldest): EarlierHeld["oldest"] {
  const [last = null] = items.toReversed();
  if (last === null) {
    return held;
  }
  return last.message.id;
}

interface Asking {
  readonly earlier: EarlierHeld;
  readonly limit: number;
}

function queryOf({ earlier, limit }: Asking): InboxHistoryQuery {
  return { limit, ...(earlier.oldest !== null && { before: earlier.oldest }) };
}

interface Paged {
  readonly entries: InboxEntries;
  readonly page: InboxHistoryResponse;
}

function pagedOn({ entries, page }: Paged): EarlierHeld {
  const earlier = earlierWithPage({ entries, page: page.items });
  return { ...earlier, hasMore: page.hasMore, oldest: oldestOf({ held: entries.earlier.oldest, items: page.items }) };
}

interface ReadingOn extends InboxReading {
  readonly entries: InboxEntries;
  readonly before: number;
}

async function readOn(reading: ReadingOn): Promise<EarlierHeld> {
  const { earlier } = reading.entries;
  if (earlier.read.size > reading.before || !earlier.hasMore) {
    return earlier;
  }
  const page = await reading.client.inboxHistory(queryOf({ earlier, limit: reading.pageSize }));
  return readOn({ ...reading, entries: { ...reading.entries, earlier: pagedOn({ ...reading, page }) } });
}

interface FirstPage extends InboxReading {
  readonly state: InboxState;
  readonly page: InboxHistoryResponse;
}

async function firstRead({ page, state, ...reading }: FirstPage): Promise<EarlierHeld> {
  const { entries } = state;
  const first = { ...entries, earlier: pagedOn({ entries, page }) };
  try {
    const read = await readOn({ ...reading, before: entries.earlier.read.size, entries: first });
    return { ...read, status: LOADED };
  } catch (error: unknown) {
    return { ...first.earlier, status: failure(error) };
  }
}

interface EarlierReading extends InboxReading {
  readonly state: InboxState;
  readonly history: Settled<InboxHistoryResponse>;
}

async function earlierRead({ history, state, ...reading }: EarlierReading): Promise<EarlierHeld> {
  const { entries } = state;
  const { earlier } = entries;
  if (!history.ok) {
    return { ...earlier, status: heldOr(earlier.status, history.error) };
  }
  if (earlier.status.status === "loaded") {
    return { ...earlierWithPage({ entries, page: history.value.items }), status: LOADED };
  }
  const first = await firstRead({ ...reading, page: history.value, state });
  return first;
}

function historyApplied(state: InboxState, history: Settled<InboxHistoryResponse>): InboxState {
  const { entries } = state;
  if (!history.ok) {
    return { ...state, entries: { ...entries, history: heldOr(entries.history, history.error) } };
  }
  return { ...state, entries: withHistoryNotices({ entries, history: history.value }) };
}

interface Answers {
  readonly inbox: Settled<InboxResponse>;
  readonly positions: Settled<ReadPositionsResponse>;
}

function inboxAnswered(state: InboxState, { inbox, positions }: Answers): InboxState {
  if (!inbox.ok) {
    return { ...state, entries: { ...state.entries, inbox: heldOr(state.entries.inbox, inbox.error) } };
  }
  if (!positions.ok) {
    return { ...state, entries: { ...state.entries, inbox: heldOr(state.entries.inbox, positions.error) } };
  }
  return withInbox({ inbox: inbox.value, server: positions.value.readPositions, state });
}

interface Reread {
  readonly reading: InboxReading;
  readonly held: InboxState;
}

async function inboxRead({ held, reading }: Reread): Promise<InboxState> {
  const { client, pageSize } = reading;
  const [inbox, positions, history] = await Promise.all([
    settled(client.inbox()),
    settled(client.readPositions()),
    settled(client.inboxHistory({ limit: pageSize })),
  ]);
  const state = inboxAnswered(historyApplied(held, history), { inbox, positions });
  const earlier = await earlierRead({ ...reading, history, state });
  return { ...state, entries: { ...state.entries, earlier } };
}

export { type InboxClient, type InboxReading, inboxRead, oldestOf, queryOf };

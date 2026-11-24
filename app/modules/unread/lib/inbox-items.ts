import type {
  ChannelName,
  CookoutClient,
  CookoutEvent,
  DeactivatedQuietAgent,
  DeactivationOffer,
  InboxItem,
  Message,
  MessageId,
  MovedBackReadPosition,
  Nudge,
  OfflineAlert,
  ReadPosition,
} from "../../sdk/index.ts";
import { forgetChannelIn } from "./deleted-channels.ts";
import { reparent } from "./closed-threads.ts";

interface InboxItems {
  readonly addAll: (all: readonly InboxItem[]) => void;
  readonly readAll: (all: readonly ReadPosition[], onRead: (item: InboxItem) => void) => void;
  readonly moveBack: (position: MovedBackReadPosition) => void;
  readonly movesBack: (channel: ChannelName, thread: MessageId | null) => number;
  readonly readPosition: (channel: ChannelName, thread: MessageId | null) => MessageId | null;
  readonly readPositions: () => readonly ReadPosition[];
  readonly receive: (event: CookoutEvent, onRead: (item: InboxItem) => void) => boolean;
  readonly forgetChannel: (channel: ChannelName) => void;
  readonly list: () => readonly InboxItem[];
  readonly has: (id: MessageId) => boolean;
  readonly isRead: (message: Message) => boolean;
}

function scopeOf(channel: string, thread: MessageId | null): string {
  if (thread === null) {
    return channel;
  }
  return `${channel}/${String(thread)}`;
}

function scopeOfMessage(message: Message): string {
  if (message.kind === "reply") {
    return scopeOf(message.channel, message.replyTo);
  }
  return scopeOf(message.channel, null);
}

function oldestFirst(items: Iterable<InboxItem>): readonly InboxItem[] {
  return [...items].toSorted((first, second) => first.message.id - second.message.id);
}

type Positions = Map<string, MessageId>;

type Places = Map<string, Pick<ReadPosition, "channel" | "thread">>;

const NO_MOVES = 0;
const ONE_MORE = 1;

function isReadAt(positions: Positions, message: Message): boolean {
  const position = positions.get(scopeOfMessage(message)) ?? null;
  return position !== null && message.id <= position;
}

function isReaction(item: InboxItem): boolean {
  return item.reasons.includes("reaction");
}

function ackedAt(position: ReadPosition, item: InboxItem): boolean {
  const { message } = item;
  return scopeOfMessage(message) === scopeOf(position.channel, position.thread) && message.id <= position.messageId;
}

function isReadIn({ acked, positions }: Pick<ReadingIn, "acked" | "positions">, item: InboxItem): boolean {
  if (isReaction(item)) {
    return acked.some((position) => ackedAt(position, item));
  }
  return isReadAt(positions, item.message);
}

function moveTo(positions: Positions, position: ReadPosition): void {
  const scope = scopeOf(position.channel, position.thread);
  const before = positions.get(scope) ?? position.messageId;
  if (before <= position.messageId) {
    positions.set(scope, position.messageId);
  }
}

interface Moved {
  readonly positions: Positions;
  readonly moves: Map<string, number>;
}

function positionsIn(positions: Positions, places: Places): readonly ReadPosition[] {
  const all: ReadPosition[] = [];
  for (const [scope, place] of places) {
    const messageId = positions.get(scope) ?? null;
    if (messageId !== null) {
      all.push({ ...place, messageId });
    }
  }
  return all;
}

function moveBackIn({ moves, positions }: Moved, { channel, messageId, thread }: MovedBackReadPosition): void {
  const scope = scopeOf(channel, thread);
  positions.delete(scope);
  if (messageId !== null) {
    positions.set(scope, messageId);
  }
  moves.set(scope, (moves.get(scope) ?? NO_MOVES) + ONE_MORE);
}

interface ReadingIn {
  readonly all: readonly ReadPosition[];
  readonly acked: readonly ReadPosition[];
  readonly items: Map<MessageId, InboxItem>;
  readonly positions: Positions;
  readonly places: Places;
  readonly onRead: (item: InboxItem) => void;
}

function readIn({ acked, all, items, onRead, places, positions }: ReadingIn): void {
  for (const position of all) {
    moveTo(positions, position);
    places.set(scopeOf(position.channel, position.thread), { channel: position.channel, thread: position.thread });
  }
  for (const [id, item] of items) {
    if (isReadIn({ acked, positions }, item)) {
      items.delete(id);
      onRead(item);
    }
  }
}

interface Receiving extends Pick<ReadingIn, "items" | "onRead" | "places" | "positions"> {
  readonly addAll: (all: readonly InboxItem[]) => void;
}

function receiveIn({ addAll, items, onRead, places, positions }: Receiving, event: CookoutEvent): boolean {
  if (event.type === "inbox-item") {
    addAll([event.item]);
    return true;
  }
  if (event.type === "read-position") {
    readIn({ acked: [event.readPosition], all: [event.readPosition], items, onRead, places, positions });
    return true;
  }
  if (event.type === "thread") {
    return reparent({ items, parent: event.parent });
  }
  return false;
}

function createInboxItems(): InboxItems {
  const items = new Map<MessageId, InboxItem>();
  const positions: Positions = new Map();
  const places: Places = new Map();
  const moved: Moved = { moves: new Map(), positions };

  function isRead(message: Message): boolean {
    return isReadAt(positions, message);
  }

  function addAll(all: readonly InboxItem[]): void {
    for (const item of all) {
      if (isReaction(item) || !isRead(item.message)) {
        items.set(item.message.id, item);
      }
    }
  }

  function read(all: readonly ReadPosition[], onRead: (item: InboxItem) => void): void {
    readIn({ acked: [], all, items, onRead, places, positions });
  }

  return {
    addAll,
    forgetChannel: (channel) => {
      forgetChannelIn({ channel, items, places, positions });
    },
    has: (id) => items.has(id),
    isRead,
    list: () => oldestFirst(items.values()),
    moveBack: (position) => {
      places.set(scopeOf(position.channel, position.thread), { channel: position.channel, thread: position.thread });
      moveBackIn(moved, position);
    },
    movesBack: (channel, thread) => moved.moves.get(scopeOf(channel, thread)) ?? NO_MOVES,
    readAll: read,
    readPosition: (channel, thread) => positions.get(scopeOf(channel, thread)) ?? null,
    readPositions: () => positionsIn(positions, places),
    receive: (event, onRead) => receiveIn({ addAll, items, onRead, places, positions }, event),
  };
}

interface Reading {
  readonly client: Pick<CookoutClient, "inbox" | "readPositions">;
  readonly items: InboxItems;
  readonly onRead: (item: InboxItem) => void;
  readonly onAlerts: (alerts: readonly OfflineAlert[]) => void;
  readonly onNudges: (nudges: readonly Nudge[]) => void;
  readonly onDeactivationOffers: (offers: readonly DeactivationOffer[]) => void;
  readonly onDeactivatedQuietAgents: (entries: readonly DeactivatedQuietAgent[]) => void;
}

interface ReadInbox
  extends Pick<Reading, "items" | "onAlerts" | "onDeactivatedQuietAgents" | "onDeactivationOffers" | "onNudges"> {
  readonly inbox: Awaited<ReturnType<Reading["client"]["inbox"]>>;
}

function readIntoItems(reading: ReadInbox): void {
  const { inbox, items, onAlerts, onDeactivatedQuietAgents, onDeactivationOffers, onNudges } = reading;
  items.addAll(inbox.items);
  onAlerts(inbox.alerts);
  onNudges(inbox.nudges);
  onDeactivationOffers(inbox.deactivationOffers);
  onDeactivatedQuietAgents(inbox.deactivatedQuietAgents);
}

async function readInto(reading: Reading): Promise<void> {
  const { client, items, onRead } = reading;
  const [inbox, { readPositions }] = await Promise.all([client.inbox(), client.readPositions()]);
  items.readAll(readPositions, onRead);
  readIntoItems({ ...reading, inbox });
}

type ByPlace = ReadonlyMap<string, MessageId>;

interface CatchUpOptions extends Reading {
  readonly moveBack: (position: MovedBackReadPosition) => void;
}

interface Compared {
  readonly before: ByPlace;
  readonly now: ByPlace;
  readonly server: ByPlace;
}

function placeOf({ channel, thread }: Pick<ReadPosition, "channel" | "thread">): string {
  return `${channel}/${String(thread)}`;
}

function byPlace(all: readonly ReadPosition[]): ByPlace {
  return new Map(all.map((position) => [placeOf(position), position.messageId]));
}

function unchanged({ before, now }: Compared, place: string): boolean {
  return (before.get(place) ?? null) === (now.get(place) ?? null);
}

function isBehind(server: MessageId | null, held: MessageId): boolean {
  return server === null || server < held;
}

function movedBack(compared: Compared, held: readonly ReadPosition[]): readonly MovedBackReadPosition[] {
  const moved: MovedBackReadPosition[] = [];
  for (const { channel, messageId, thread } of held) {
    const place = placeOf({ channel, thread });
    const server = compared.server.get(place) ?? null;
    if (unchanged(compared, place) && isBehind(server, messageId)) {
      moved.push({ channel, messageId: server, thread });
    }
  }
  return moved;
}

async function catchUp(options: CatchUpOptions): Promise<void> {
  const { items } = options;
  const before = byPlace(items.readPositions());
  const [inbox, { readPositions }] = await Promise.all([options.client.inbox(), options.client.readPositions()]);
  const held = items.readPositions();
  const compared: Compared = { before, now: byPlace(held), server: byPlace(readPositions) };
  for (const position of movedBack(compared, held)) {
    options.moveBack(position);
  }
  const movedOn = readPositions.filter((position) => unchanged(compared, placeOf(position)));
  items.readAll(movedOn, options.onRead);
  readIntoItems({ ...options, inbox });
}

interface CatchingUp extends CatchUpOptions {
  readonly onChange: () => void;
}

function catchingUp(options: CatchingUp): () => void {
  let queue: Promise<void> = Promise.resolve();
  async function after(previous: Promise<void>): Promise<void> {
    await previous;
    await Promise.allSettled([catchUp(options)]);
    options.onChange();
  }
  return () => {
    queue = after(queue);
  };
}

export { type InboxItems, catchingUp, createInboxItems, readInto };

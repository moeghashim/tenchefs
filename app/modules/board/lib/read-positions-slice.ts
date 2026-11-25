import type {
  ChannelName,
  CookoutEvent,
  Message,
  MessageId,
  MovedBackReadPosition,
  ReadPosition,
} from "../../sdk/index.ts";

interface ReadPositions {
  readonly byPlace: ReadonlyMap<string, ReadPosition>;
  readonly movesBack: ReadonlyMap<string, number>;
}

interface Place {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

interface AtPlace {
  readonly positions: ReadPositions;
  readonly place: Place;
}

const NO_MOVES = 0;
const ONE_MORE = 1;

const NO_READ_POSITIONS: ReadPositions = { byPlace: new Map(), movesBack: new Map() };

function placeKey({ channel, thread }: Place): string {
  if (thread === null) {
    return channel;
  }
  return `${channel}/${String(thread)}`;
}

function placeOfMessage(message: Message): Place {
  if (message.kind === "reply") {
    return { channel: message.channel, thread: message.replyTo };
  }
  return { channel: message.channel, thread: null };
}

function heldAt(byPlace: ReadPositions["byPlace"], key: string): MessageId | null {
  const held = byPlace.get(key) ?? null;
  if (held === null) {
    return null;
  }
  return held.messageId;
}

function readPositionAt({ place, positions }: AtPlace): MessageId | null {
  return heldAt(positions.byPlace, placeKey(place));
}

interface AtId extends AtPlace {
  readonly id: MessageId;
}

function isReadAtPlace({ id, place, positions }: AtId): boolean {
  const position = readPositionAt({ place, positions });
  return position !== null && id <= position;
}

function movesBackAt({ place, positions }: AtPlace): number {
  return positions.movesBack.get(placeKey(place)) ?? NO_MOVES;
}

interface MovingOn {
  readonly positions: ReadPositions;
  readonly all: readonly ReadPosition[];
}

function isAhead(byPlace: ReadPositions["byPlace"], position: ReadPosition): boolean {
  const held = heldAt(byPlace, placeKey(position));
  return held === null || held < position.messageId;
}

function movedOn({ all, positions }: MovingOn): ReadPositions {
  const ahead = all.filter((position) => isAhead(positions.byPlace, position));
  if (ahead.length === NO_MOVES) {
    return positions;
  }
  const byPlace = new Map(positions.byPlace);
  for (const position of ahead) {
    if (isAhead(byPlace, position)) {
      byPlace.set(placeKey(position), position);
    }
  }
  return { ...positions, byPlace };
}

interface MovingBack {
  readonly positions: ReadPositions;
  readonly position: MovedBackReadPosition;
}

function isThereAlready({ position, positions }: MovingBack): boolean {
  const place = { channel: position.channel, thread: position.thread };
  return movesBackAt({ place, positions }) > NO_MOVES && readPositionAt({ place, positions }) === position.messageId;
}

function placedBack({ position, positions }: MovingBack): ReadPositions["byPlace"] {
  const key = placeKey(position);
  const byPlace = new Map(positions.byPlace);
  const { channel, messageId, thread } = position;
  byPlace.delete(key);
  if (messageId !== null) {
    byPlace.set(key, { channel, messageId, thread });
  }
  return byPlace;
}

function movedBack(moving: MovingBack): ReadPositions {
  const { position, positions } = moving;
  if (isThereAlready(moving)) {
    return positions;
  }
  const key = placeKey(position);
  const byPlace = placedBack(moving);
  const { channel, thread } = position;
  const moves = movesBackAt({ place: { channel, thread }, positions }) + ONE_MORE;
  return { byPlace, movesBack: new Map(positions.movesBack).set(key, moves) };
}

function withoutChannel(positions: ReadPositions, channel: ChannelName): ReadPositions {
  const gone = [...positions.byPlace.values()].filter((position) => position.channel === channel);
  if (gone.length === NO_MOVES) {
    return positions;
  }
  const byPlace = new Map(positions.byPlace);
  for (const position of gone) {
    byPlace.delete(placeKey(position));
  }
  return { ...positions, byPlace };
}

interface Hearing {
  readonly positions: ReadPositions;
  readonly event: CookoutEvent;
}

function readPositionsApplied({ event, positions }: Hearing): ReadPositions {
  if (event.type === "read-position") {
    return movedOn({ all: [event.readPosition], positions });
  }
  if (event.type === "read-position-moved-back") {
    return movedBack({ position: event.readPosition, positions });
  }
  if (event.type === "channel-deleted") {
    return withoutChannel(positions, event.channel.name);
  }
  return positions;
}

interface Comparing {
  readonly held: ReadPositions;
  readonly server: readonly ReadPosition[];
}

function behindOnServer({ held, server }: Comparing): readonly MovedBackReadPosition[] {
  const read = new Map(server.map((position) => [placeKey(position), position.messageId]));
  const behind: MovedBackReadPosition[] = [];
  for (const [key, { channel, messageId, thread }] of held.byPlace) {
    const now = read.get(key) ?? null;
    if (now === null || now < messageId) {
      behind.push({ channel, messageId: now, thread });
    }
  }
  return behind;
}

export {
  NO_READ_POSITIONS,
  type Place,
  type ReadPositions,
  behindOnServer,
  isReadAtPlace,
  movedBack,
  movedOn,
  movesBackAt,
  placeKey,
  placeOfMessage,
  readPositionAt,
  readPositionsApplied,
};

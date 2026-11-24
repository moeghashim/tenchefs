import type {
  AppendMessageResult,
  ChannelPageRequest,
  Mentioning,
  MessagesSection,
  NewMessage,
  Placement,
  StoredPage,
  StoredThread,
} from "./messages.ts";
import { Array as Arr, Effect, Option, Predicate, Ref, pipe } from "effect";
import type { Author, Message, MessageId, TopLevelMessage } from "../../../messages/index.ts";
import { EMPTY_INBOX, memoryReactions, withoutChannel, withoutIdentity } from "./inbox-memory-state.ts";
import { afterAppend, memoryInbox } from "./inbox-memory.ts";
import { asMessageId, isPlaced, placeIn, placed, stampedAfter, threadIdOf, withKnownMentions } from "./messages.ts";
import { current, findMessage, memoryThreads, repliesTo, threadChangedBy } from "./threads-memory.ts";
import type { IdentitiesSection } from "./identities.ts";
import type { MemoryChannelsSection } from "./channels.ts";
import type { MemoryInbox } from "./inbox-memory-state.ts";
import type { MemoryInboxSection } from "./inbox-memory.ts";
import type { MemoryState } from "./memory-state.ts";
import type { MemoryThreads } from "./threads-memory.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isMessageId } from "../../../messages/index.ts";

interface MemoryMessages extends MemoryThreads {
  readonly last: number;
  readonly latestAt: Option.Option<NewMessage["createdAt"]>;
  readonly inbox: MemoryInbox;
}

interface MemoryMessagesOptions {
  readonly channels: Pick<MemoryChannelsSection, "findChannel" | "listChannels">;
  readonly identities: Pick<IdentitiesSection, "listIdentities">;
  readonly state: MemoryState;
}

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type ChannelName = NewMessage["channel"];

const NEXT = 1;
const EMPTY: MemoryMessages = {
  inbox: EMPTY_INBOX,
  last: 0,
  latestAt: Option.none(),
  messages: [],
  reopenedAt: new Map(),
};
const CHANNEL_NOT_FOUND = { status: "channel_not_found" } as const;

function placementOf(messages: readonly Message[], { channel, replyTo }: NewMessage): Placement {
  if (Predicate.isUndefined(replyTo)) {
    return { status: "top-level" };
  }
  return placeIn({ channel, found: Option.getOrUndefined(findMessage({ id: replyTo, messages })) });
}

function append(data: MemoryMessages, appending: Mentioning): readonly [AppendMessageResult, MemoryMessages] {
  const placement = placementOf(data.messages, appending.message);
  if (!isPlaced(placement)) {
    return [placement, data];
  }
  const last = data.last + NEXT;
  const message = stampedAfter({ latest: data.latestAt, message: withKnownMentions(appending) });
  const stored = placed({ id: asMessageId(last), message, placement });
  const [changedParent, { messages }] = threadChangedBy({
    close: appending.message.close,
    data: { ...data, messages: [...data.messages, stored] },
    stored,
  });
  const [receipts, inbox] = afterAppend({ inbox: data.inbox, message: stored, messages });
  return [
    { message: stored, receipts, status: "appended", threadChanged: Option.getOrUndefined(changedParent) },
    { ...data, inbox, last, latestAt: Option.some(message.createdAt), messages },
  ];
}

function withThreads<Value>(
  data: MemoryMessages,
  [value, threads]: readonly [Value, MemoryThreads],
): readonly [Value, MemoryMessages] {
  return [value, { ...data, ...threads }];
}

function threadIn(messages: readonly Message[], id: MessageId): StoredThread | undefined {
  return pipe(
    findMessage({ id, messages }),
    Option.flatMap((found) =>
      Arr.findFirst(
        messages,
        (message): message is TopLevelMessage => message.kind === "top-level" && message.id === threadIdOf(found),
      ),
    ),
    Option.map((parent) => ({
      parent: current({ messages, parent }),
      replies: repliesTo({ messages, parent: parent.id }),
    })),
    Option.getOrUndefined,
  );
}

function pageIn(messages: readonly Message[], channel: ChannelName, page: ChannelPageRequest): StoredPage {
  const { before = Number.MAX_SAFE_INTEGER, limit } = page;
  const older = Arr.filter(
    messages,
    (message): message is TopLevelMessage =>
      message.kind === "top-level" && message.channel === channel && message.id < before,
  );
  const shown = Arr.takeRight(older, limit);
  return { hasMore: older.length > shown.length, messages: Arr.map(shown, (parent) => current({ messages, parent })) };
}

type MemoryMessagesSection = MessagesSection &
  MemoryInboxSection &
  ReturnType<typeof memoryReactions> & {
    readonly forgetChannel: (channel: ChannelName) => Fails<ReadonlySet<MessageId>>;
    readonly forgetIdentity: (identity: Author["name"]) => Fails<void>;
    readonly countMessagesBy: (identity: Author["name"]) => Fails<number>;
  };

function withoutMessagesIn(
  data: MemoryMessages,
  channel: ChannelName,
): readonly [ReadonlySet<MessageId>, MemoryMessages] {
  const gone = Arr.filter(data.messages, (message) => message.channel === channel);
  const kept = Arr.filter(data.messages, (message) => message.channel !== channel);
  const ids = new Set(Arr.map(gone, (message) => message.id));
  return [ids, { ...data, inbox: withoutChannel({ channel, ids, inbox: data.inbox }), messages: kept }];
}

function namesAuthor(identity: Author["name"]): (message: Message) => boolean {
  return ({ author }) => author.name === identity || author.owner === identity;
}

type Listed = Effect.Success<ReturnType<IdentitiesSection["listIdentities"]>>;

function activeNamesOf(listed: Listed): Mentioning["known"] {
  const active = Arr.filter(listed, (identity) => identity.deactivated !== true);
  return new Set(Arr.map(active, (identity) => identity.name));
}

function memoryMessages({ channels, identities, state }: MemoryMessagesOptions): MemoryMessagesSection {
  const ref = Ref.makeUnsafe(EMPTY);
  function change<Value>(work: (data: MemoryMessages) => readonly [Value, MemoryMessages]): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Ref.modify(ref, work));
  }
  function readBoard<Value>(work: (data: MemoryMessages) => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.map(Ref.get(ref), work));
  }
  function read<Value>(work: (messages: readonly Message[]) => Value): Fails<Value> {
    return readBoard((data) => work(data.messages));
  }
  function channelExists(channel: ChannelName): Fails<boolean> {
    return Effect.map(channels.findChannel(channel), Predicate.isNotUndefined);
  }
  const knownNames: Fails<Mentioning["known"]> = Effect.map(identities.listIdentities(), activeNamesOf);
  function changeInbox<Value>(work: (data: MemoryMessages) => readonly [Value, MemoryInbox]): Fails<Value> {
    return change((data) => {
      const [value, inbox] = work(data);
      return [value, { ...data, inbox }];
    });
  }
  return {
    ...memoryInbox({ changeInbox, channelExists, listChannels: channels.listChannels, read: readBoard }),
    ...memoryReactions({ changeInbox, read: readBoard }),
    ...memoryThreads({ change: (work) => change((data) => withThreads(data, work(data))), read: readBoard }),
    appendMessage: (message) =>
      Effect.flatMap(channelExists(message.channel), (exists): Fails<AppendMessageResult> => {
        if (exists) {
          return Effect.flatMap(knownNames, (known) => change((data) => append(data, { known, message })));
        }
        return Effect.succeed(CHANNEL_NOT_FOUND);
      }),
    countMessagesBy: (identity) => read((messages) => Arr.filter(messages, namesAuthor(identity)).length),
    forgetChannel: (channel) => change((data) => withoutMessagesIn(data, channel)),
    forgetIdentity: (identity) =>
      Effect.asVoid(change((data) => [true, { ...data, inbox: withoutIdentity({ identity, inbox: data.inbox }) }])),
    getThread: (id) => read((messages) => threadIn(messages, id)),
    latestMessageId: readBoard(({ last }) => Option.getOrUndefined(Option.liftPredicate(last, isMessageId))),
    listChannelMessages: (channel, page) =>
      Effect.flatMap(channelExists(channel), (exists) => {
        if (exists) {
          return read((messages) => pageIn(messages, channel, page));
        }
        return Effect.undefined;
      }),
  };
}

export { memoryMessages };

import type {
  AppendMessageResult,
  ChannelPageRequest,
  Deleting,
  Mentioning,
  MessagesSection,
  NewMessage,
  Placement,
  ReplyTarget,
  StoredPage,
  StoredThread,
} from "./messages.ts";
import { Array as Arr, Effect, Option, Predicate, Ref, pipe } from "effect";
import type { Author, Message, MessageId, TopLevelMessage } from "../../../messages/index.ts";
import type { DeletedChannel, MemoryChannelsSection } from "./channels.ts";
import { EMPTY_INBOX, memoryReactions, withoutChannel, withoutIdentity } from "./inbox-memory-state.ts";
import { afterAppend, memoryInbox } from "./inbox-memory.ts";
import {
  asMessageId,
  attachmentIn,
  isPlaced,
  placeIn,
  placed,
  stampedAfter,
  threadIdOf,
  withKnownMentions,
} from "./messages.ts";
import { current, findMessage, memoryThreads, repliesTo, threadChangedBy } from "./threads-memory.ts";
import type { IdentitiesSection } from "./identities.ts";
import type { MemoryInbox } from "./inbox-memory-state.ts";
import type { MemoryInboxSection } from "./inbox-memory.ts";
import type { MemoryState } from "./memory-state.ts";
import type { MemoryThreads } from "./threads-memory.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isMessageId } from "../../../messages/index.ts";

interface MemoryMessages extends MemoryThreads {
  readonly deleted: readonly DeletedMessage[];
  readonly last: number;
  readonly latestAt: Option.Option<NewMessage["createdAt"]>;
  readonly inbox: MemoryInbox;
}

interface MemoryMessagesOptions {
  readonly channels: Pick<MemoryChannelsSection, "findChannel" | "listChannels">;
  readonly identities: Pick<IdentitiesSection, "listIdentities">;
  readonly state: MemoryState;
}

type ScheduledMessageId = NonNullable<Message["scheduledMessage"]>["id"];

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type ChannelName = NewMessage["channel"];

const NEXT = 1;
interface DeletedMessage {
  readonly message: Message;
  readonly deleting: Deleting;
}

const EMPTY: MemoryMessages = {
  deleted: [],
  inbox: EMPTY_INBOX,
  last: 0,
  latestAt: Option.none(),
  messages: [],
  reopenedAt: new Map(),
};
const CHANNEL_NOT_FOUND = { status: "channel_not_found" } as const;

function everyMessageOf({ deleted, messages }: MemoryMessages): readonly Message[] {
  return [...messages, ...Arr.map(deleted, ({ message }) => message)];
}

function targetOf(data: MemoryMessages, found: Message): ReplyTarget {
  const thread = threadIdOf(found);
  const threadDeleted = Option.isNone(findMessage({ id: thread, messages: data.messages }));
  return { channel: found.channel, thread, threadDeleted };
}

function targetIn(data: MemoryMessages, id: MessageId): ReplyTarget | undefined {
  const found = findMessage({ id, messages: everyMessageOf(data) });
  return Option.getOrUndefined(Option.map(found, (message) => targetOf(data, message)));
}

function placementOf(data: MemoryMessages, { channel, replyTo }: NewMessage): Placement {
  if (Predicate.isUndefined(replyTo)) {
    return { status: "top-level" };
  }
  return placeIn({ channel, found: targetIn(data, replyTo) });
}

function append(data: MemoryMessages, appending: Mentioning): readonly [AppendMessageResult, MemoryMessages] {
  const placement = placementOf(data, appending.message);
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

interface MemoryDeleting {
  readonly id: MessageId;
  readonly deleting: Deleting;
}

function inThreadOf(message: Message): (other: Message) => boolean {
  if (message.kind === "reply") {
    return (other) => other.id === message.id;
  }
  return (other) => other.id === message.id || (other.kind === "reply" && other.replyTo === message.id);
}

function asItWas(messages: readonly Message[], found: Message): Message {
  if (found.kind === "reply") {
    return found;
  }
  return current({ messages, parent: found });
}

function withDeleted(
  data: MemoryMessages,
  { deleting, id }: MemoryDeleting,
): readonly [Message | undefined, MemoryMessages] {
  const found = findMessage({ id, messages: data.messages });
  const next = Option.match(found, {
    onNone: () => data,
    onSome: (message) => {
      const deletes = inThreadOf(message);
      const inThread = Arr.map(Arr.filter(data.messages, deletes), (gone) => ({ deleting, message: gone }));
      const live = Arr.filter(data.messages, (other) => !deletes(other));
      return { ...data, deleted: [...data.deleted, ...inThread], messages: live };
    },
  });
  return [Option.getOrUndefined(Option.map(found, (message) => asItWas(data.messages, message))), next];
}

type Lookups = Pick<MessagesSection, "findAttachment" | "findReplyTarget">;

function lookupsIn(readBoard: <Value>(work: (data: MemoryMessages) => Value) => Fails<Value>): Lookups {
  return {
    findAttachment: (id) => readBoard((data) => attachmentIn(id)(data.messages)),
    findReplyTarget: (id) => readBoard((data) => targetIn(data, id)),
  };
}

type MemoryMessagesSection = MessagesSection &
  MemoryInboxSection &
  ReturnType<typeof memoryReactions> & {
    readonly forgetChannel: (channel: ChannelName) => Fails<ForgottenChannel>;
    readonly forgetIdentity: (identity: Author["name"]) => Fails<void>;
    readonly countMessagesBy: (identity: Author["name"]) => Fails<number>;
    readonly markMessagesOf: (schedule: ScheduledMessageId) => Fails<void>;
  };

interface ForgottenChannel {
  readonly messageIds: ReadonlySet<MessageId>;
  readonly attachments: DeletedChannel["attachments"];
}

function markedDeleted(schedule: ScheduledMessageId): (message: Message) => Message {
  return (message) => {
    if (Predicate.isUndefined(message.scheduledMessage) || message.scheduledMessage.id !== schedule) {
      return message;
    }
    return { ...message, scheduledMessage: { deleted: true, id: schedule } };
  };
}

function withScheduleDeleted(schedule: ScheduledMessageId) {
  return (data: MemoryMessages): readonly [true, MemoryMessages] => [
    true,
    { ...data, messages: Arr.map(data.messages, markedDeleted(schedule)) },
  ];
}

function withoutMessagesIn(data: MemoryMessages, channel: ChannelName): readonly [ForgottenChannel, MemoryMessages] {
  const gone = Arr.filter(everyMessageOf(data), (message) => message.channel === channel);
  const kept = Arr.filter(data.messages, (message) => message.channel !== channel);
  const deleted = Arr.filter(data.deleted, ({ message }) => message.channel !== channel);
  const ids = new Set(Arr.map(gone, (message) => message.id));
  const attachments = Arr.flatMap(gone, (message) => Arr.map(message.attachments ?? [], ({ id }) => id));
  return [
    { attachments, messageIds: ids },
    { ...data, deleted, inbox: withoutChannel({ channel, ids, inbox: data.inbox }), messages: kept },
  ];
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
    countMessagesBy: (identity) => readBoard((data) => Arr.filter(everyMessageOf(data), namesAuthor(identity)).length),
    deleteMessage: (id, deleting) => change((data) => withDeleted(data, { deleting, id })),
    ...lookupsIn(readBoard),
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
    markMessagesOf: (schedule) => Effect.asVoid(change(withScheduleDeleted(schedule))),
  };
}

export { memoryMessages };

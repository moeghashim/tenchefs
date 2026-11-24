import { Array as Arr, Option, Predicate, pipe } from "effect";
import type { Closing, Message, MessageId, OpenThread, Reply, TopLevelMessage } from "../../../messages/index.ts";
import type { MessagesSection, NewMessage, ThreadStateChange } from "./messages.ts";
import type { OpenThreadsPageRequest, StoredOpenThreadsPage } from "./open-threads.ts";
import { closingBy, counted, threadIdOf } from "./messages.ts";
import { involves, lastActivityOf, pageOfOpenThreads } from "./open-threads.ts";
import type { Effect } from "effect";
import type { IdentityName } from "../../../identities/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { memorySearch } from "./search-memory.ts";
import { reopened } from "../../../messages/index.ts";

interface MemoryThreads {
  readonly messages: readonly Message[];
  readonly reopenedAt: ReadonlyMap<MessageId, ReopenedAt>;
}

type ReopenedAt = TopLevelMessage["createdAt"];

type ParentChange = (parent: TopLevelMessage) => Option.Option<TopLevelMessage>;

type Changed<Value> = readonly [Value, MemoryThreads];

type Change = <Value>(work: (data: MemoryThreads) => Changed<Value>) => Fails<Value>;

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface ThreadsOn {
  readonly change: Change;
  readonly read: <Value>(work: (data: MemoryThreads) => Value) => Fails<Value>;
}

interface Finding {
  readonly messages: readonly Message[];
  readonly id: MessageId;
}

interface RepliesTo {
  readonly messages: readonly Message[];
  readonly parent: MessageId;
}

interface Current {
  readonly messages: readonly Message[];
  readonly parent: TopLevelMessage;
}

interface ChangedBy {
  readonly data: MemoryThreads;
  readonly stored: Message;
  readonly close: NewMessage["close"];
}

type ThreadsSection = Pick<MessagesSection, "closeThread" | "reopenThread" | "listOpenThreads" | "searchMessages">;

function findMessage({ id, messages }: Finding): Option.Option<Message> {
  return Arr.findFirst(messages, (message) => message.id === id);
}

function repliesTo({ messages, parent }: RepliesTo): readonly Reply[] {
  return Arr.filter(messages, (message): message is Reply => message.kind === "reply" && message.replyTo === parent);
}

function current({ messages, parent }: Current): TopLevelMessage {
  return counted({ parent, replies: repliesTo({ messages, parent: parent.id }) });
}

function isTopLevel(message: Message): message is TopLevelMessage {
  return message.kind === "top-level";
}

function parentOf(messages: readonly Message[], id: MessageId): Option.Option<TopLevelMessage> {
  return pipe(
    findMessage({ id, messages }),
    Option.flatMap((found) => Arr.findFirst(messages, (message) => message.id === threadIdOf(found))),
    Option.filter(isTopLevel),
  );
}

function withStored(messages: readonly Message[], parent: TopLevelMessage): readonly Message[] {
  return Arr.map(messages, (message) => {
    if (message.id === parent.id) {
      return parent;
    }
    return message;
  });
}

function closing(closed: Closing): ParentChange {
  return (parent) =>
    Option.map(
      Option.liftPredicate(parent, ({ closedAt }) => Predicate.isUndefined(closedAt)),
      (open) => ({ ...open, ...closed }),
    );
}

function reopening(parent: TopLevelMessage): Option.Option<TopLevelMessage> {
  return Option.map(
    Option.liftPredicate(parent, ({ closedAt }) => Predicate.isNotUndefined(closedAt)),
    reopened,
  );
}

function changeParent(data: MemoryThreads, parent: TopLevelMessage, change: ParentChange): Changed<ThreadStateChange> {
  return Option.match(change(parent), {
    onNone: () => [{ changed: false, parent: current({ messages: data.messages, parent }) }, data],
    onSome: (changed) => {
      const messages = withStored(data.messages, changed);
      return [
        { changed: true, parent: current({ messages, parent: changed }) },
        { ...data, messages },
      ];
    },
  });
}

function changeThread(
  data: MemoryThreads,
  id: MessageId,
  change: ParentChange,
): Changed<Option.Option<ThreadStateChange>> {
  return Option.match(parentOf(data.messages, id), {
    onNone: () => [Option.none(), data],
    onSome: (parent) => {
      const [result, next] = changeParent(data, parent, change);
      return [Option.some(result), next];
    },
  });
}

function changeFor(reply: Reply, close: NewMessage["close"]): ParentChange {
  if (Predicate.isUndefined(close)) {
    return reopening;
  }
  return closing(closingBy(reply));
}

function threadChangedBy({ close, data, stored }: ChangedBy): Changed<Option.Option<TopLevelMessage>> {
  if (stored.kind === "top-level") {
    return [Option.none(), data];
  }
  const [result, next] = changeThread(data, stored.id, changeFor(stored, close));
  const parent = Option.flatMap(result, (change) => Option.liftPredicate(change.parent, () => change.changed));
  return [parent, next];
}

interface Reopening {
  readonly id: MessageId;
  readonly at: ReopenedAt;
}

function reopenAt(data: MemoryThreads, { at, id }: Reopening): Changed<ThreadStateChange | undefined> {
  const [result, next] = changeThread(data, id, reopening);
  return Option.match(
    Option.filter(result, (change) => change.changed),
    {
      onNone: () => [Option.getOrUndefined(result), next],
      onSome: (change) => [change, { ...next, reopenedAt: new Map([...next.reopenedAt, [change.parent.id, at]]) }],
    },
  );
}

function openThreadOf(data: MemoryThreads): (parent: TopLevelMessage) => OpenThread {
  return (parent) => {
    const replies = repliesTo({ messages: data.messages, parent: parent.id });
    const reopenedAt = data.reopenedAt.get(parent.id);
    return {
      lastActivityAt: lastActivityOf({ parent, reopenedAt, replies }),
      message: current({ messages: data.messages, parent }),
    };
  };
}

function openThreadsIn(
  data: MemoryThreads,
  identity: IdentityName,
  page: OpenThreadsPageRequest,
): StoredOpenThreadsPage {
  const open = Arr.filter(
    data.messages,
    (message): message is TopLevelMessage => isTopLevel(message) && Predicate.isUndefined(message.closedAt),
  );
  const shown = Arr.filter(
    open,
    (parent) =>
      page.all ||
      involves({ identity, messages: [parent, ...repliesTo({ messages: data.messages, parent: parent.id })] }),
  );
  return pageOfOpenThreads({ page, threads: Arr.map(shown, openThreadOf(data)) });
}

function memoryThreads({ change, read }: ThreadsOn): ThreadsSection {
  return {
    ...memorySearch((work) => read((data) => work(data.messages))),
    closeThread: (id, closed) =>
      change((data) => {
        const [result, next] = changeThread(data, id, closing(closed));
        return [Option.getOrUndefined(result), next];
      }),
    listOpenThreads: (identity, page) => read((data) => openThreadsIn(data, identity, page)),
    reopenThread: (id, at) => change((data) => reopenAt(data, { at, id })),
  };
}

export { type MemoryThreads, current, findMessage, memoryThreads, repliesTo, threadChangedBy };

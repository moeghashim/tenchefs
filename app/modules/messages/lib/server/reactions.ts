import { Array as Arr, Context, DateTime, Effect, Layer, Predicate, PubSub } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type {
  ListMessagesResponse,
  Message,
  MessageId,
  Reaction,
  ReactionCount,
  ReactionName,
  ReactionsResponse,
  ThreadResponse,
} from "../../index.ts";
import type { Storage, StorageUnavailable, StoredPage, StoredThread } from "../../../storage/server.ts";
import { isReactionName, reactionNames } from "../../index.ts";
import { messageNotFound, reactionNotFound } from "./refusals.ts";
import { pageWithReceipts, threadWithReceipts } from "./read-receipts.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type Refuses<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type Store = Storage["Service"];

interface ReactionChange {
  readonly reactions: ReactionsResponse;
  readonly author: IdentityName;
  readonly notified: boolean;
}

interface ReactionsService {
  readonly publish: (change: ReactionChange) => Effect.Effect<void>;
  readonly changed: Effect.Effect<PubSub.Subscription<ReactionChange>, never, Scope.Scope>;
}

class Reactions extends Context.Service<Reactions, ReactionsService>()(
  "@ai-hero/cookout/messages/lib/server/reactions",
) {}

const reactionsLayer: Layer.Layer<Reactions> = Layer.effect(
  Reactions,
  Effect.gen(function* reactionsHub() {
    const hub = yield* PubSub.unbounded<ReactionChange>();
    return {
      changed: PubSub.subscribe(hub),
      publish: (change: ReactionChange) => Effect.asVoid(PubSub.publish(hub, change)),
    };
  }),
);

function countsIn(reactions: readonly Reaction[], id: MessageId): readonly ReactionCount[] {
  const onMessage = Arr.filter(reactions, (reaction) => reaction.messageId === id);
  return Arr.flatMap(reactionNames, (name) => {
    const by = Arr.map(
      Arr.filter(onMessage, (reaction) => reaction.reaction === name),
      (reaction) => reaction.identity,
    );
    if (!Arr.isReadonlyArrayNonEmpty(by)) {
      return [];
    }
    return [{ by, count: by.length, reaction: name }];
  });
}

function withCounts(reactions: readonly Reaction[]): <Shown extends Message>(message: Shown) => Shown {
  return (message) => {
    const counts = countsIn(reactions, message.id);
    if (!Arr.isReadonlyArrayNonEmpty(counts)) {
      return message;
    }
    return { ...message, reactions: counts };
  };
}

interface Showing<Shown> {
  readonly storage: Store;
  readonly shown: Shown;
}

type Counter = <Shown extends Message>(message: Shown) => Shown;

function reactionCounter({ shown: ids, storage }: Showing<readonly MessageId[]>): Fails<Counter> {
  return Effect.map(storage.listReactions(Arr.dedupe(ids)), withCounts);
}

function withReactions<Shown extends Message>({
  shown: messages,
  storage,
}: Showing<readonly Shown[]>): Fails<readonly Shown[]> {
  return Effect.map(storage.listReactions(Arr.map(messages, (message) => message.id)), (reactions) =>
    Arr.map(messages, withCounts(reactions)),
  );
}

function threadWithReactions({ shown: thread, storage }: Showing<ThreadResponse>): Fails<ThreadResponse> {
  const { parent, replies } = thread;
  return Effect.map(storage.listReactions([parent.id, ...Arr.map(replies, (reply) => reply.id)]), (reactions) => {
    const counted = withCounts(reactions);
    return { ...thread, parent: counted(parent), replies: Arr.map(replies, counted) };
  });
}

function shownPage({ shown, storage }: Showing<StoredPage>): Fails<ListMessagesResponse> {
  return Effect.flatMap(pageWithReceipts({ storage, stored: shown }), (page) =>
    Effect.map(withReactions({ shown: page.messages, storage }), (messages) => ({ ...page, messages })),
  );
}

function shownThread({ shown, storage }: Showing<StoredThread>): Fails<ThreadResponse> {
  return Effect.flatMap(threadWithReceipts({ storage, stored: shown }), (thread) =>
    threadWithReactions({ shown: thread, storage }),
  );
}

function reactionOf(asked: string): Effect.Effect<ReactionName, Refusal> {
  if (isReactionName(asked)) {
    return Effect.succeed(asked);
  }
  return Effect.fail(reactionNotFound(asked));
}

function messagesIn(thread: StoredThread | undefined): readonly Message[] {
  if (Predicate.isUndefined(thread)) {
    return [];
  }
  return [thread.parent, ...thread.replies];
}

function findMessage(storage: Store, id: MessageId): Refuses<Message> {
  return Effect.flatMap(storage.getThread(id), (thread) => {
    const found = Arr.findFirst(messagesIn(thread), (message) => message.id === id);
    return Effect.mapError(Effect.fromOption(found), () => messageNotFound(String(id)));
  });
}

function notifiesAuthor(storage: Store, caller: Identity, message: Message): Fails<boolean> {
  const author = message.author.name;
  if (author === caller.name) {
    return Effect.succeed(false);
  }
  return Effect.map(
    storage.findIdentityByName(author),
    (found) => Predicate.isNotUndefined(found) && found.deactivated !== true,
  );
}

function answerFor(storage: Store, message: Message): Fails<ReactionsResponse> {
  return Effect.map(storage.listReactions([message.id]), (reactions) => ({
    channel: message.channel,
    messageId: message.id,
    reactions: countsIn(reactions, message.id),
  }));
}

interface ReactionAsked {
  readonly caller: Identity;
  readonly id: MessageId;
  readonly reaction: string;
}

interface Reacting {
  readonly storage: Store;
  readonly hub: ReactionsService;
  readonly asked: ReactionAsked;
}

function react({ asked, hub, storage }: Reacting): Refuses<ReactionsResponse> {
  const { caller, id, reaction } = asked;
  return Effect.gen(function* addReaction() {
    const name = yield* reactionOf(reaction);
    const message = yield* findMessage(storage, id);
    const notifies = yield* notifiesAuthor(storage, caller, message);
    const now = yield* DateTime.now;
    const reactedAt = isoTimeOf(now);
    const added = yield* storage.addReaction({
      identity: caller.name,
      messageId: id,
      notifiesAuthor: notifies,
      reactedAt,
      reaction: name,
    });
    const answer = yield* answerFor(storage, message);
    if (added === true) {
      yield* hub.publish({ author: message.author.name, notified: notifies, reactions: answer });
    }
    return answer;
  });
}

function unreact({ asked, hub, storage }: Reacting): Refuses<ReactionsResponse> {
  const { caller, id, reaction } = asked;
  return Effect.gen(function* removeReaction() {
    const name = yield* reactionOf(reaction);
    const message = yield* findMessage(storage, id);
    const removed = yield* storage.removeReaction({ identity: caller.name, messageId: id, reaction: name });
    const answer = yield* answerFor(storage, message);
    if (removed === true) {
      yield* hub.publish({ author: message.author.name, notified: false, reactions: answer });
    }
    return answer;
  });
}

export { Reactions, react, reactionCounter, reactionsLayer, shownPage, shownThread, unreact, withReactions };

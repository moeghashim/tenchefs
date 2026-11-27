import { Array as Arr, DateTime, Effect, Predicate, PubSub, String as Str } from "effect";
import type { MessageId, TopLevelMessage, TopLevelMessageResponse } from "../../index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { Identity } from "../../../identities/index.ts";
import type { MessageDeletion } from "./deleting.ts";
import type { MessagesService } from "./service.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { deleteMessageWith } from "./deleting.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { messageNotFound } from "./refusals.ts";

type OneAtATime = <Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
) => Effect.Effect<Value, Failure, Needs>;

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type ThreadChange = Effect.Success<ReturnType<Storage["Service"]["reopenThread"]>>;

type ClosedThreadsService = Pick<
  MessagesService,
  "closeThread" | "reopenThread" | "setThreadTitle" | "threadChanged" | "deleteMessage" | "deleted"
>;

interface ThreadHub {
  readonly oneAtATime: OneAtATime;
  readonly changeThenPublish: (change: Effect.Effect<ThreadChange, StorageUnavailable>) => Fails<ThreadChange>;
  readonly publishThreadChange: (parent: TopLevelMessage | undefined) => Effect.Effect<void>;
  readonly threadChanged: Effect.Effect<PubSub.Subscription<TopLevelMessage>, never, Scope.Scope>;
  readonly publishDeletion: (deletion: MessageDeletion) => Effect.Effect<void>;
  readonly deleted: Effect.Effect<PubSub.Subscription<MessageDeletion>, never, Scope.Scope>;
}

interface ClosedThreadsOn {
  readonly hub: ThreadHub;
  readonly storage: Storage["Service"];
}

function changedParents(change: ThreadChange): readonly TopLevelMessage[] {
  if (Predicate.isUndefined(change) || !change.changed) {
    return [];
  }
  return [change.parent];
}

function answerFor(asked: MessageId): (change: ThreadChange) => Fails<TopLevelMessageResponse> {
  return (change) => {
    if (Predicate.isUndefined(change)) {
      return Effect.fail(messageNotFound(String(asked)));
    }
    return Effect.succeed({ message: change.parent });
  };
}

interface TitleChange {
  readonly caller: Identity;
  readonly id: MessageId;
  readonly title: string;
}

function titleChange(
  storage: Storage["Service"],
  { caller, id, title }: TitleChange,
): Effect.Effect<ThreadChange, StorageUnavailable> {
  if (Str.isEmpty(title)) {
    return storage.clearThreadTitle(id);
  }
  return Effect.flatMap(DateTime.now, (now) =>
    storage.setThreadTitle(id, { title, titleSetAt: isoTimeOf(now), titleSetBy: caller.name }),
  );
}

function threadHub(oneAtATime: OneAtATime): Effect.Effect<ThreadHub> {
  return Effect.gen(function* makeThreadHub() {
    const threads = yield* PubSub.unbounded<TopLevelMessage>();
    const deletions = yield* PubSub.unbounded<MessageDeletion>();
    function publish(parents: readonly TopLevelMessage[]): Effect.Effect<void> {
      return Effect.asVoid(PubSub.publishAll(threads, parents));
    }
    return {
      changeThenPublish: (change) => oneAtATime(Effect.tap(change, (changed) => publish(changedParents(changed)))),
      deleted: PubSub.subscribe(deletions),
      oneAtATime,
      publishDeletion: (deletion) => Effect.asVoid(PubSub.publish(deletions, deletion)),
      publishThreadChange: (parent) => publish(Arr.filter([parent], Predicate.isNotUndefined)),
      threadChanged: PubSub.subscribe(threads),
    };
  });
}

function closedThreadsOn({ hub, storage }: ClosedThreadsOn): ClosedThreadsService {
  return {
    closeThread: (caller, id) =>
      Effect.gen(function* closeThread() {
        const now = yield* DateTime.now;
        const closing = { closedAt: isoTimeOf(now), closedBy: caller.name };
        const change = yield* hub.changeThenPublish(storage.closeThread(id, closing));
        return yield* answerFor(id)(change);
      }),
    deleteMessage: deleteMessageWith({ oneAtATime: hub.oneAtATime, publishDeletion: hub.publishDeletion, storage }),
    deleted: hub.deleted,
    reopenThread: (id) =>
      Effect.gen(function* reopenThread() {
        const now = yield* DateTime.now;
        const change = yield* hub.changeThenPublish(storage.reopenThread(id, isoTimeOf(now)));
        return yield* answerFor(id)(change);
      }),
    setThreadTitle: (caller, id, title) =>
      Effect.flatMap(hub.changeThenPublish(titleChange(storage, { caller, id, title })), answerFor(id)),
    threadChanged: hub.threadChanged,
  };
}

export { closedThreadsOn, threadHub };

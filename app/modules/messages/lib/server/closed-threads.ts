import { Array as Arr, DateTime, Effect, Predicate, PubSub } from "effect";
import type { MessageId, TopLevelMessage, TopLevelMessageResponse } from "../../index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { MessagesService } from "./service.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { isoTimeOf } from "../../../time/server.ts";
import { messageNotFound } from "./refusals.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type ThreadChange = Effect.Success<ReturnType<Storage["Service"]["reopenThread"]>>;

type ClosedThreadsService = Pick<MessagesService, "closeThread" | "reopenThread" | "threadChanged">;

interface ThreadHub {
  readonly changeThenPublish: (change: Effect.Effect<ThreadChange, StorageUnavailable>) => Fails<ThreadChange>;
  readonly publishThreadChange: (parent: TopLevelMessage | undefined) => Effect.Effect<void>;
  readonly threadChanged: Effect.Effect<PubSub.Subscription<TopLevelMessage>, never, Scope.Scope>;
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

type OneAtATime = <Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
) => Effect.Effect<Value, Failure, Needs>;

function threadHub(oneAtATime: OneAtATime): Effect.Effect<ThreadHub> {
  return Effect.gen(function* makeThreadHub() {
    const threads = yield* PubSub.unbounded<TopLevelMessage>();
    function publish(parents: readonly TopLevelMessage[]): Effect.Effect<void> {
      return Effect.asVoid(PubSub.publishAll(threads, parents));
    }
    return {
      changeThenPublish: (change) => oneAtATime(Effect.tap(change, (changed) => publish(changedParents(changed)))),
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
    reopenThread: (id) =>
      Effect.gen(function* reopenThread() {
        const now = yield* DateTime.now;
        const change = yield* hub.changeThenPublish(storage.reopenThread(id, isoTimeOf(now)));
        return yield* answerFor(id)(change);
      }),
    threadChanged: hub.threadChanged,
  };
}

export { closedThreadsOn, threadHub };

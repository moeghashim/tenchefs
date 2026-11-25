import { Array as Arr, Effect, Predicate } from "effect";
import type { MessageId, Reply } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredThread } from "../../../storage/server.ts";
import type { Identity } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { withReactions } from "./reactions.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type Store = Storage["Service"];

interface Watching {
  readonly author: Identity;
  readonly replyTo?: MessageId | undefined;
  readonly seen?: MessageId | undefined;
}

interface Moving extends Watching {
  readonly storage: Store;
}

const NONE: readonly Reply[] = [];
const ONE = 1;
const CONFLICT = 409;

function newerByOthers(thread: StoredThread | undefined, upTo: MessageId, author: Identity): readonly Reply[] {
  if (Predicate.isUndefined(thread)) {
    return NONE;
  }
  return Arr.filter(thread.replies, (reply) => reply.id > upTo && reply.author.name !== author.name);
}

function laterOf(replyTo: MessageId, seen: MessageId): MessageId {
  if (seen > replyTo) {
    return seen;
  }
  return replyTo;
}

function movedSince({ author, replyTo, seen, storage }: Moving): Fails<readonly Reply[]> {
  if (author.kind !== "agent" || Predicate.isUndefined(replyTo) || Predicate.isUndefined(seen)) {
    return Effect.succeed(NONE);
  }
  return Effect.map(storage.getThread(replyTo), (thread) => newerByOthers(thread, laterOf(replyTo, seen), author));
}

function movedMessage(count: number): string {
  if (count === ONE) {
    return "The thread has 1 newer reply you haven't seen. Read it before you post again.";
  }
  return `The thread has ${String(count)} newer replies you haven't seen. Read them before you post again.`;
}

function refuseIfMoved(moving: Moving): Effect.Effect<void, Refusal | StorageUnavailable> {
  return Effect.flatMap(movedSince(moving), (moved) => {
    if (!Arr.isReadonlyArrayNonEmpty(moved)) {
      return Effect.void;
    }
    return Effect.flatMap(withReactions({ shown: moved, storage: moving.storage }), (replies) =>
      Effect.fail({
        code: "thread_moved",
        details: { replies },
        message: movedMessage(replies.length),
        status: CONFLICT,
      }),
    );
  });
}

export { refuseIfMoved };

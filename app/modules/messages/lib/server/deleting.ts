import { Array as Arr, DateTime, Effect, Option } from "effect";
import type { Message, MessageId, TopLevelMessage } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredThread } from "../../../storage/server.ts";
import { messageNotFound, notOwnMessage } from "./refusals.ts";
import type { DeletedMessageResponse } from "../../client.ts";
import type { Identity } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type OneAtATime = <Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
) => Effect.Effect<Value, Failure, Needs>;

interface MessageDeletion {
  readonly message: Message;
  readonly parent?: TopLevelMessage;
}

interface DeletingOn {
  readonly storage: Storage["Service"];
  readonly oneAtATime: OneAtATime;
  readonly publishDeletion: (deletion: MessageDeletion) => Effect.Effect<void>;
}

interface Asking {
  readonly caller: Identity;
  readonly message: Message;
}

interface Deleted {
  readonly id: MessageId;
  readonly caller: Identity;
}

function mayDelete({ caller, message }: Asking): boolean {
  if (message.author.name === caller.name) {
    return true;
  }
  return caller.kind === "human" && caller.admin;
}

function present<Found extends Message>(id: MessageId, found: Option.Option<Found>): Fails<Found> {
  return Effect.mapError(Effect.fromOption(found), () => messageNotFound(String(id)));
}

function messageIn(storage: Storage["Service"], id: MessageId): Fails<Message> {
  return Effect.flatMap(storage.getThread(id), (thread) => {
    const inThread: readonly Message[] = Arr.flatMap(Arr.fromNullishOr(thread), (found) => [
      found.parent,
      ...found.replies,
    ]);
    return present(
      id,
      Arr.findFirst(inThread, (message) => message.id === id),
    );
  });
}

function parentIn(thread: StoredThread | undefined): Option.Option<TopLevelMessage> {
  return Option.map(Option.fromUndefinedOr(thread), (found) => found.parent);
}

function deletionOf(storage: Storage["Service"], message: Message): Fails<MessageDeletion> {
  if (message.kind === "top-level") {
    return Effect.succeed({ message });
  }
  return Effect.flatMap(storage.getThread(message.replyTo), (thread) =>
    Effect.map(present(message.id, parentIn(thread)), (parent) => ({ message, parent })),
  );
}

function deleteThenPublish({ publishDeletion, storage }: DeletingOn, { caller, id }: Deleted): Fails<Message> {
  return Effect.gen(function* deleteThenPublishDeletion() {
    const now = yield* DateTime.now;
    const gone = yield* storage.deleteMessage(id, { deletedAt: isoTimeOf(now), deletedBy: caller.name });
    const message = yield* present(id, Option.fromUndefinedOr(gone));
    const deletion = yield* deletionOf(storage, message);
    yield* publishDeletion(deletion);
    return message;
  });
}

function deleteMessageWith(on: DeletingOn) {
  return (caller: Identity, id: MessageId): Fails<DeletedMessageResponse> =>
    Effect.gen(function* deleteMessage() {
      const message = yield* messageIn(on.storage, id);
      if (!mayDelete({ caller, message })) {
        return yield* Effect.fail(notOwnMessage);
      }
      const deleted = yield* on.oneAtATime(deleteThenPublish(on, { caller, id }));
      return { message: deleted };
    });
}

export { type MessageDeletion, deleteMessageWith };

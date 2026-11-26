import { Array as Arr, DateTime, Effect, Option, Predicate, String as Str, pipe } from "effect";
import type { Attaching, Post, StoredFiles } from "../../../attachments/server.ts";
import type { Author, JsonValue, Message, MessageId, MessageResponse } from "../../index.ts";
import type { Harness, Identity } from "../../../identities/index.ts";
import type { NewMessage, ScheduledRun, Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { PubSub, Scope } from "effect";
import {
  closeWithoutReplyTo,
  messageNotFound,
  replyInOtherChannel,
  seenWithoutReplyTo,
  threadDeleted,
} from "./refusals.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { Refusal } from "./refusals.ts";
import { channelNotFound } from "../../../channels/server.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { mentionPattern } from "../../index.ts";
import { refuseIfMoved } from "./thread-moved.ts";

interface PostMessage {
  readonly channel: ChannelName;
  readonly text: string;
  readonly data?: JsonValue;
  readonly replyTo?: MessageId;
  readonly close?: true;
  readonly harness?: Harness;
  readonly seen?: MessageId;
  readonly attachments?: Post["attachments"];
}

type Refused = "channel_not_found" | "reply_to_not_found" | "reply_in_other_channel" | "thread_deleted";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Hub {
  readonly appendThenPublish: <Result extends Appended>(
    append: (message: NewMessage) => Fails<Result>,
    message: NewMessage,
  ) => Fails<Result>;
  readonly subscribe: Effect.Effect<PubSub.Subscription<Message>, never, Scope.Scope>;
}

function authorOf(identity: Identity): Author {
  if (identity.kind === "human" || Predicate.isUndefined(identity.owner)) {
    return { name: identity.name };
  }
  return { name: identity.name, owner: identity.owner };
}

function withReplyTo(message: NewMessage, replyTo: MessageId | undefined): NewMessage {
  if (Predicate.isUndefined(replyTo)) {
    return message;
  }
  return { ...message, replyTo };
}

function mentionedNames(text: string): readonly string[] {
  return pipe(text, Str.match(mentionPattern), Option.map(Arr.dedupe), Option.getOrElse(Arr.empty));
}

function unknownMentionsIn({ mentions, text }: Message): readonly string[] {
  return Arr.filter(mentionedNames(text), (name) => !Arr.some(mentions, (mentioned) => mentioned === name));
}

function withClose(message: NewMessage, close: true | undefined): NewMessage {
  if (Predicate.isUndefined(close)) {
    return message;
  }
  return { ...message, close };
}

function withHarness(message: NewMessage, harness: Harness | undefined): NewMessage {
  if (Predicate.isUndefined(harness)) {
    return message;
  }
  return { ...message, harness };
}

function newMessage(author: Identity, posting: PostMessage, createdAt: NewMessage["createdAt"]): NewMessage {
  const { close, harness, channel, data, replyTo, text } = posting;
  const mentions = Arr.filter(mentionedNames(text), isIdentityName);
  const fields = withClose(
    withHarness({ author: authorOf(author), channel, createdAt, mentions, text }, harness),
    close,
  );
  if (Predicate.isUndefined(data)) {
    return withReplyTo(fields, replyTo);
  }
  return withReplyTo({ ...fields, data }, replyTo);
}

function refusalOf(status: Refused, message: PostMessage): Refusal {
  if (status === "channel_not_found") {
    return channelNotFound(message.channel);
  }
  if (status === "reply_to_not_found") {
    return messageNotFound(String(message.replyTo));
  }
  if (status === "thread_deleted") {
    return threadDeleted(message);
  }
  return replyInOtherChannel(message);
}

type Append = Storage["Service"]["appendMessage"];

type Appended = Effect.Success<ReturnType<Append>>;

interface Posting {
  readonly hub: Hub;
  readonly append: (message: NewMessage) => Fails<Appended>;
  readonly attaching: Attaching;
  readonly storage: Storage["Service"];
}

function withAttachments(message: NewMessage, { attachments }: StoredFiles): NewMessage {
  if (Arr.isReadonlyArrayNonEmpty(attachments)) {
    return { ...message, attachments };
  }
  return message;
}

function unfitRefusal({ close, replyTo, seen }: PostMessage): Option.Option<Refusal> {
  if (Predicate.isNotUndefined(replyTo)) {
    return Option.none();
  }
  if (Predicate.isNotUndefined(close)) {
    return Option.some(closeWithoutReplyTo);
  }
  return Option.map(Option.fromUndefinedOr(seen), () => seenWithoutReplyTo);
}

type AppendedOk = Extract<Appended, { readonly status: "appended" }>;

function appendUnmoved({ append, storage }: Posting, author: Identity, message: PostMessage) {
  return (stored: NewMessage): Fails<Appended> =>
    Effect.andThen(refuseIfMoved({ author, replyTo: message.replyTo, seen: message.seen, storage }), append(stored));
}

function appendedOr(message: PostMessage): (result: Appended) => Fails<AppendedOk> {
  return (result) => {
    if (result.status !== "appended") {
      return Effect.fail(refusalOf(result.status, message));
    }
    return Effect.succeed(result);
  };
}

function answerTo(result: AppendedOk): MessageResponse {
  return { message: result.message, unknownMentions: unknownMentionsIn(result.message) };
}

function postWith(posting: Posting): (author: Identity, message: PostMessage) => Fails<MessageResponse> {
  return (author, message) =>
    Effect.gen(function* postMessage() {
      const unfit = unfitRefusal(message);
      if (Option.isSome(unfit)) {
        return yield* Effect.fail(unfit.value);
      }
      const { attachments = [], ...rest } = message;
      const files = yield* posting.attaching.store({ attachments, text: rest.text });
      const now = yield* DateTime.now;
      const stored = withAttachments(newMessage(author, rest, isoTimeOf(now)), files);
      const result = yield* posting.hub.appendThenPublish(appendUnmoved(posting, author, rest), stored).pipe(
        Effect.flatMap(appendedOr(rest)),
        Effect.onError(() => files.remove),
      );
      return answerTo(result);
    });
}

type ScheduledRunParts = Omit<ScheduledRun, "message">;

type RunResult = Effect.Success<ReturnType<Storage["Service"]["runScheduledMessage"]>>;

const runMoved: Refusal = {
  code: "scheduled_message_not_found",
  message: "The Scheduled message changed before its run posted.",
  status: 409,
};

function isAppendResult(result: RunResult): result is Appended {
  return result.status !== "run_moved" && result.status !== "skipped";
}

function postScheduledWith({
  attaching,
  hub,
  storage,
}: Omit<Posting, "append">): (
  author: Identity,
  message: PostMessage,
  run: ScheduledRunParts,
) => Fails<MessageResponse> {
  return (author, message, run) => {
    function append(stored: NewMessage): Fails<Appended> {
      return Effect.filterOrFail(
        storage.runScheduledMessage({ ...run, message: stored }),
        isAppendResult,
        () => runMoved,
      );
    }
    return postWith({ append, attaching, hub, storage })(author, message);
  };
}

export { type Appended, type Hub, type PostMessage, type ScheduledRunParts, postScheduledWith, postWith };

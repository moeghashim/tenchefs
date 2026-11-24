import { Array as Arr, Context, DateTime, Effect, Option, Predicate, String as Str, pipe } from "effect";
import type {
  Author,
  JsonValue,
  ListMessagesResponse,
  ListOpenThreadsResponse,
  Message,
  MessageId,
  MessageResponse,
  ReactionsResponse,
  ThreadResponse,
  TopLevelMessage,
  TopLevelMessageResponse,
} from "../../index.ts";
import type { Harness, Identity } from "../../../identities/index.ts";
import type {
  NewCommandCall,
  NewMessage,
  OpenThreadsPageRequest,
  Storage,
  StorageUnavailable,
} from "../../../storage/server.ts";
import type { PubSub, Scope } from "effect";
import {
  closeWithCommandToken,
  closeWithoutReplyTo,
  messageNotFound,
  replyInOtherChannel,
  replyOutsideCommandThread,
} from "./refusals.ts";
import { mentionPattern, pageSize } from "../../index.ts";
import { react, shownPage, shownThread, unreact } from "./reactions.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { Reactions } from "./reactions.ts";
import type { Refusal } from "../../../http/index.ts";
import { channelNotFound } from "../../../channels/server.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

interface PostMessage {
  readonly channel: ChannelName;
  readonly text: string;
  readonly data?: JsonValue;
  readonly replyTo?: MessageId;
  readonly close?: true;
  readonly harness?: Harness;
}

interface PageQuery {
  readonly before?: MessageId;
  readonly limit?: number;
}

interface PageRequest {
  readonly before?: MessageId;
  readonly limit: number;
}

type Refused = "channel_not_found" | "reply_to_not_found" | "reply_in_other_channel";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type CallParts = Omit<NewCommandCall, "message">;

interface Hub {
  readonly appendThenPublish: (append: Append, message: NewMessage) => Fails<Appended>;
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
  return replyInOtherChannel(message);
}

function pageRequest({ before, limit = pageSize.default }: PageQuery): PageRequest {
  if (Predicate.isUndefined(before)) {
    return { limit };
  }
  return { before, limit };
}

function inThread(
  found: Pick<ThreadResponse, "parent"> | undefined,
  threadId: MessageId,
  channel: ChannelName,
): boolean {
  return Predicate.isNotUndefined(found) && found.parent.id === threadId && found.parent.channel === channel;
}

type Append = Storage["Service"]["appendMessage"];

type Appended = Effect.Success<ReturnType<Append>>;

const ONE_AT_A_TIME = 1;

function postWith(hub: Hub, append: Append): (author: Identity, message: PostMessage) => Fails<MessageResponse> {
  return (author, message) =>
    Effect.gen(function* postMessage() {
      if (Predicate.isNotUndefined(message.close) && Predicate.isUndefined(message.replyTo)) {
        return yield* Effect.fail(closeWithoutReplyTo);
      }
      const now = yield* DateTime.now;
      const stored = newMessage(author, message, isoTimeOf(now));
      const result = yield* hub.appendThenPublish(append, stored);
      if (result.status === "appended") {
        return { message: result.message, unknownMentions: unknownMentionsIn(result.message) };
      }
      return yield* Effect.fail(refusalOf(result.status, message));
    });
}

interface MessagesOn {
  readonly storage: Storage["Service"];
  readonly hub: Hub;
  readonly reactions: Reactions["Service"];
}

type ThreadChangeCalls = "closeThread" | "reopenThread" | "threadChanged" | "listOpenThreads";

function messagesOn({ hub, reactions, storage }: MessagesOn): Omit<MessagesService, ThreadChangeCalls> {
  const post = postWith(hub, storage.appendMessage);
  return {
    latestId: storage.latestMessageId,
    page: (channel, query) =>
      Effect.gen(function* pageChannel() {
        if (!isChannelName(channel)) {
          return yield* Effect.fail(channelNotFound(channel));
        }
        const page = yield* storage.listChannelMessages(channel, pageRequest(query));
        if (Predicate.isUndefined(page)) {
          return yield* Effect.fail(channelNotFound(channel));
        }
        return yield* shownPage({ shown: page, storage });
      }),
    post,
    postCommandCall: (author, message, call) =>
      postWith(hub, (stored) => storage.appendCommandCall({ ...call, message: stored }))(author, message),
    postInThread: (author, message, threadId) =>
      Effect.gen(function* postInCommandThread() {
        const { channel, close, replyTo } = message;
        if (Predicate.isNotUndefined(close)) {
          return yield* Effect.fail(closeWithCommandToken);
        }
        if (Predicate.isUndefined(replyTo)) {
          return yield* Effect.fail(replyOutsideCommandThread);
        }
        const found = yield* storage.getThread(replyTo);
        if (!inThread(found, threadId, channel)) {
          return yield* Effect.fail(replyOutsideCommandThread);
        }
        return yield* post(author, message);
      }),
    posted: hub.subscribe,
    react: (caller, id, reaction) => react({ asked: { caller, id, reaction }, hub: reactions, storage }),
    thread: (id) =>
      Effect.gen(function* getThread() {
        const thread = yield* storage.getThread(id);
        if (Predicate.isUndefined(thread)) {
          return yield* Effect.fail(messageNotFound(String(id)));
        }
        return yield* shownThread({ shown: thread, storage });
      }),
    unreact: (caller, id, reaction) => unreact({ asked: { caller, id, reaction }, hub: reactions, storage }),
  };
}

export interface OpenThreadsQuery {
  readonly all?: "true";
  readonly cursor?: OpenThreadsPageRequest["after"];
  readonly limit?: number;
}

export interface MessagesService {
  readonly listOpenThreads: (
    caller: Identity,
    query: OpenThreadsQuery,
  ) => Effect.Effect<ListOpenThreadsResponse, StorageUnavailable>;
  readonly post: (author: Identity, message: PostMessage) => Fails<MessageResponse>;
  readonly postCommandCall: (author: Identity, message: PostMessage, call: CallParts) => Fails<MessageResponse>;
  readonly postInThread: (author: Identity, message: PostMessage, threadId: MessageId) => Fails<MessageResponse>;
  readonly thread: (id: MessageId) => Fails<ThreadResponse>;
  readonly page: (channel: string, query: PageQuery) => Fails<ListMessagesResponse>;
  readonly posted: Effect.Effect<PubSub.Subscription<Message>, never, Scope.Scope>;
  readonly latestId: Effect.Effect<MessageId | undefined, StorageUnavailable>;
  readonly react: (caller: Identity, id: MessageId, reaction: string) => Fails<ReactionsResponse>;
  readonly unreact: (caller: Identity, id: MessageId, reaction: string) => Fails<ReactionsResponse>;
  readonly closeThread: (caller: Identity, id: MessageId) => Fails<TopLevelMessageResponse>;
  readonly reopenThread: (id: MessageId) => Fails<TopLevelMessageResponse>;
  readonly threadChanged: Effect.Effect<PubSub.Subscription<TopLevelMessage>, never, Scope.Scope>;
}

export class Messages extends Context.Service<Messages, MessagesService>()(
  "@ai-hero/cookout/messages/lib/server/service/Messages",
) {}

export { type Appended, type Hub, ONE_AT_A_TIME, messagesOn };

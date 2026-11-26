import { Context, Effect, Option, Predicate } from "effect";
import type { Hub, PostMessage, ScheduledRunParts } from "./posting.ts";
import type {
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
import type {
  NewWebhookCommandCall,
  OpenThreadsPageRequest,
  ReplyTarget,
  Storage,
  StorageUnavailable,
} from "../../../storage/server.ts";
import type { PubSub, Scope } from "effect";
import {
  closeWithWebhookCommandToken,
  messageNotFound,
  replyOutsideWebhookCommandThread,
  threadDeleted,
} from "./refusals.ts";
import { postScheduledWith, postWith } from "./posting.ts";
import { react, shownPage, shownThread, unreact } from "./reactions.ts";
import type { Attaching } from "../../../attachments/server.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { Identity } from "../../../identities/index.ts";
import type { Reactions } from "./reactions.ts";
import type { Refusal } from "./refusals.ts";
import { channelNotFound } from "../../../channels/server.ts";
import { isChannelName } from "../../../channels/index.ts";
import { pageSize } from "../../index.ts";

interface PageQuery {
  readonly before?: MessageId;
  readonly limit?: number;
}

interface PageRequest {
  readonly before?: MessageId;
  readonly limit: number;
}

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type CallParts = Omit<NewWebhookCommandCall, "message">;

function pageRequest({ before, limit = pageSize.default }: PageQuery): PageRequest {
  if (Predicate.isUndefined(before)) {
    return { limit };
  }
  return { before, limit };
}

interface InThread {
  readonly channel: ChannelName;
  readonly target: ReplyTarget | undefined;
  readonly threadId: MessageId;
}

function refusalInThread({ channel, target, threadId }: InThread, message: PostMessage): Option.Option<Refusal> {
  if (Predicate.isUndefined(target) || target.thread !== threadId || target.channel !== channel) {
    return Option.some(replyOutsideWebhookCommandThread);
  }
  if (target.threadDeleted) {
    return Option.some(threadDeleted(message));
  }
  return Option.none();
}

const ONE_AT_A_TIME = 1;

interface MessagesOn {
  readonly storage: Storage["Service"];
  readonly hub: Hub;
  readonly reactions: Reactions["Service"];
  readonly attaching: Attaching;
}

type ThreadChangeCalls =
  | "closeThread"
  | "reopenThread"
  | "threadChanged"
  | "listOpenThreads"
  | "deleteMessage"
  | "deleted";

function pageWith(storage: Storage["Service"]): MessagesService["page"] {
  return (channel, query) =>
    Effect.gen(function* pageChannel() {
      if (!isChannelName(channel)) {
        return yield* Effect.fail(channelNotFound(channel));
      }
      const page = yield* storage.listChannelMessages(channel, pageRequest(query));
      if (Predicate.isUndefined(page)) {
        return yield* Effect.fail(channelNotFound(channel));
      }
      return yield* shownPage({ shown: page, storage });
    });
}

function messagesOn({ attaching, hub, reactions, storage }: MessagesOn): Omit<MessagesService, ThreadChangeCalls> {
  const posting = { attaching, hub, storage };
  const post = postWith({ ...posting, append: storage.appendMessage });
  return {
    latestId: storage.latestMessageId,
    page: pageWith(storage),
    post,
    postInThread: (author, message, threadId) =>
      Effect.gen(function* postInWebhookCommandThread() {
        const { channel, close, replyTo } = message;
        if (Predicate.isNotUndefined(close)) {
          return yield* Effect.fail(closeWithWebhookCommandToken);
        }
        if (Predicate.isUndefined(replyTo)) {
          return yield* Effect.fail(replyOutsideWebhookCommandThread);
        }
        const target = yield* storage.findReplyTarget(replyTo);
        const refused = refusalInThread({ channel, target, threadId }, message);
        if (Option.isSome(refused)) {
          return yield* Effect.fail(refused.value);
        }
        return yield* post(author, message);
      }),
    postScheduled: postScheduledWith(posting),
    postWebhookCommandCall: (author, message, call) =>
      postWith({ ...posting, append: (stored) => storage.appendWebhookCommandCall({ ...call, message: stored }) })(
        author,
        message,
      ),
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
  readonly postWebhookCommandCall: (author: Identity, message: PostMessage, call: CallParts) => Fails<MessageResponse>;
  readonly postInThread: (author: Identity, message: PostMessage, threadId: MessageId) => Fails<MessageResponse>;
  readonly postScheduled: (author: Identity, message: PostMessage, run: ScheduledRunParts) => Fails<MessageResponse>;
  readonly thread: (id: MessageId) => Fails<ThreadResponse>;
  readonly page: (channel: string, query: PageQuery) => Fails<ListMessagesResponse>;
  readonly posted: Effect.Effect<PubSub.Subscription<Message>, never, Scope.Scope>;
  readonly latestId: Effect.Effect<MessageId | undefined, StorageUnavailable>;
  readonly react: (caller: Identity, id: MessageId, reaction: string) => Fails<ReactionsResponse>;
  readonly unreact: (caller: Identity, id: MessageId, reaction: string) => Fails<ReactionsResponse>;
  readonly closeThread: (caller: Identity, id: MessageId) => Fails<TopLevelMessageResponse>;
  readonly reopenThread: (id: MessageId) => Fails<TopLevelMessageResponse>;
  readonly threadChanged: Effect.Effect<PubSub.Subscription<TopLevelMessage>, never, Scope.Scope>;
  readonly deleteMessage: (caller: Identity, id: MessageId) => Fails<{ readonly message: Message }>;
  readonly deleted: Effect.Effect<
    PubSub.Subscription<{ readonly message: Message; readonly parent?: TopLevelMessage }>,
    never,
    Scope.Scope
  >;
}

export class Messages extends Context.Service<Messages, MessagesService>()(
  "@ai-hero/cookout/messages/lib/server/service/Messages",
) {}

export { ONE_AT_A_TIME, messagesOn };

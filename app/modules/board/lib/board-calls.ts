import type { Answered, DeletingClient, MessageDeleting } from "./message-deleting.ts";
import type { AskedFrom, SubscriptionChange, SubscriptionsClient } from "./subscriptions-slice.ts";
import type {
  Channel,
  ChannelName,
  CookoutClient,
  CookoutEvent,
  CreateChannelRequest,
  IsoTime,
  Message,
  MessageId,
  SearchRequest,
  SubscriptionResponse,
} from "../../sdk/index.ts";
import type { ClosingClient, ClosingRefusal } from "./thread-closing.ts";
import type {
  CreateScheduledMessageRequest,
  EditScheduledMessageRequest,
  PreviewScheduledMessageQuery,
  ScheduledMessage,
  ScheduledMessageId,
} from "../../scheduled-messages/index.ts";
import type { SearchAnswer } from "../../search/web.ts";
import { createMessageAcks } from "./message-acks.ts";
import { createMessageDeleting } from "./message-deleting.ts";
import { createThreadClosing } from "./thread-closing.ts";
import { refusedAs } from "./subscriptions-slice.ts";

type CallsClient = ClosingClient &
  DeletingClient &
  SubscriptionsClient &
  Pick<
    CookoutClient,
    | "ack"
    | "createChannel"
    | "createScheduledMessage"
    | "deleteScheduledMessage"
    | "editScheduledMessage"
    | "pauseScheduledMessage"
    | "previewScheduledMessage"
    | "resumeScheduledMessage"
    | "search"
  >;

type ScheduleChange = "pause" | "resume" | "remove";

interface BoardCalls {
  readonly createChannel: (request: CreateChannelRequest) => Promise<Channel>;
  readonly setSubscribed: (channel: ChannelName, subscribed: boolean, from: AskedFrom) => void;
  readonly close: (messageId: MessageId) => void;
  readonly reopen: (messageId: MessageId) => void;
  readonly closingRefusal: () => ClosingRefusal | null;
  readonly askDelete: (message: Message) => void;
  readonly cancelDelete: () => void;
  readonly deleteMessage: (messageId: MessageId, answered: Answered) => void;
  readonly deleting: () => MessageDeleting;
  readonly ack: (id: MessageId) => void;
  readonly search: (request: SearchRequest) => Promise<SearchAnswer>;
  readonly createScheduledMessage: (request: CreateScheduledMessageRequest) => Promise<ScheduledMessage>;
  readonly previewScheduledMessage: (query: PreviewScheduledMessageQuery) => Promise<readonly IsoTime[]>;
  readonly editScheduledMessage: (
    id: ScheduledMessageId,
    request: EditScheduledMessageRequest,
  ) => Promise<ScheduledMessage>;
  readonly changeScheduledMessage: (id: ScheduledMessageId, change: ScheduleChange) => Promise<void>;
}

interface CallsOptions {
  readonly client: CallsClient;
  readonly heard: (event: CookoutEvent) => void;
  readonly subscriptionChanged: (change: SubscriptionChange) => void;
  readonly changed: () => void;
  readonly keepResults: (asked: Promise<SearchAnswer>) => Promise<SearchAnswer>;
}

async function send(client: SubscriptionsClient, channel: ChannelName, wanted: boolean): Promise<SubscriptionResponse> {
  if (wanted) {
    const subscribed = await client.subscribe(channel);
    return subscribed;
  }
  const unsubscribed = await client.unsubscribe(channel);
  return unsubscribed;
}

async function answerOf(client: CallsClient, request: SearchRequest): Promise<SearchAnswer> {
  try {
    const page = await client.search(request);
    return { page };
  } catch (error: unknown) {
    return { refusal: refusedAs(error) };
  }
}

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function subscribing(options: CallsOptions): BoardCalls["setSubscribed"] {
  let queue = Promise.resolve();
  const { client, subscriptionChanged } = options;
  return (channel, wanted, from) => {
    queue = after(queue, async () => {
      subscriptionChanged({ channel, type: "subscription-asked" });
      try {
        const { subscribed } = await send(client, channel, wanted);
        subscriptionChanged({ channel, subscribed, type: "subscription-answered" });
      } catch (error: unknown) {
        subscriptionChanged({ channel, from, refusal: refusedAs(error), type: "subscription-refused" });
      }
    });
  };
}

async function changed(client: CallsClient, id: ScheduledMessageId, change: ScheduleChange): Promise<ScheduledMessage> {
  if (change === "pause") {
    const { scheduledMessage } = await client.pauseScheduledMessage(id);
    return scheduledMessage;
  }
  if (change === "resume") {
    const { scheduledMessage } = await client.resumeScheduledMessage(id);
    return scheduledMessage;
  }
  const { scheduledMessage } = await client.deleteScheduledMessage(id);
  return scheduledMessage;
}

type ScheduleCalls = Pick<BoardCalls, "changeScheduledMessage" | "createScheduledMessage" | "editScheduledMessage">;

function scheduleCalls({ client, heard }: CallsOptions): ScheduleCalls {
  return {
    changeScheduledMessage: async (id, change) => {
      const scheduledMessage = await changed(client, id, change);
      heard({ deleted: change === "remove", scheduledMessage, type: "scheduled-message" });
    },
    createScheduledMessage: async (request) => {
      const { scheduledMessage } = await client.createScheduledMessage(request);
      heard({ deleted: false, scheduledMessage, type: "scheduled-message" });
      return scheduledMessage;
    },
    editScheduledMessage: async (id, request) => {
      const { scheduledMessage } = await client.editScheduledMessage(id, request);
      heard({ deleted: false, scheduledMessage, type: "scheduled-message" });
      return scheduledMessage;
    },
  };
}

function createBoardCalls(options: CallsOptions): BoardCalls {
  const { client, heard } = options;
  const closing = createThreadClosing({
    changed: (parent) => {
      heard({ parent, type: "thread" });
    },
    client,
    refused: options.changed,
  });
  const deleting = createMessageDeleting({
    changed: options.changed,
    client,
    deleted: (message) => {
      heard({ message, type: "message-deleted" });
    },
  });
  return {
    ...scheduleCalls(options),
    ack: createMessageAcks(client),
    askDelete: deleting.askDelete,
    cancelDelete: deleting.cancelDelete,
    close: closing.close,
    closingRefusal: closing.refusal,
    createChannel: async (request) => {
      const { channel } = await client.createChannel(request);
      heard({ channel, type: "channel" });
      heard({ subscription: { channel: channel.name, subscribed: true }, type: "subscription" });
      return channel;
    },
    deleteMessage: deleting.deleteMessage,
    deleting: deleting.deleting,
    previewScheduledMessage: async (query) => {
      const { nextRuns } = await client.previewScheduledMessage(query);
      return nextRuns;
    },
    reopen: closing.reopen,
    search: async (request) => {
      const answer = await options.keepResults(answerOf(client, request));
      return answer;
    },
    setSubscribed: subscribing(options),
  };
}

type ThreadClosing = Pick<BoardCalls, "close" | "reopen">;

type MessageDeletes = Pick<BoardCalls, "askDelete" | "cancelDelete" | "deleteMessage">;

export {
  type BoardCalls,
  type CallsClient,
  type MessageDeletes,
  type ScheduleChange,
  type ThreadClosing,
  createBoardCalls,
};

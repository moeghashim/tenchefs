import type { AskedFrom, SubscriptionChange, SubscriptionsClient } from "./subscriptions-slice.ts";
import type {
  Channel,
  ChannelName,
  CookoutClient,
  CookoutEvent,
  CreateChannelRequest,
  IsoTime,
  MessageId,
  SearchRequest,
  SubscriptionResponse,
} from "../../sdk/index.ts";
import type { ClosingClient, ClosingRefusal } from "./thread-closing.ts";
import type {
  CreateScheduledMessageRequest,
  PreviewScheduledMessageQuery,
  ScheduledMessage,
} from "../../scheduled-messages/index.ts";
import type { SearchAnswer } from "../../search/web.ts";
import { createMessageAcks } from "./message-acks.ts";
import { createThreadClosing } from "./thread-closing.ts";
import { refusedAs } from "./subscriptions-slice.ts";

type CallsClient = ClosingClient &
  SubscriptionsClient &
  Pick<CookoutClient, "ack" | "createChannel" | "createScheduledMessage" | "previewScheduledMessage" | "search">;

interface BoardCalls {
  readonly createChannel: (request: CreateChannelRequest) => Promise<Channel>;
  readonly setSubscribed: (channel: ChannelName, subscribed: boolean, from: AskedFrom) => void;
  readonly close: (messageId: MessageId) => void;
  readonly reopen: (messageId: MessageId) => void;
  readonly closingRefusal: () => ClosingRefusal | null;
  readonly ack: (id: MessageId) => void;
  readonly search: (request: SearchRequest) => Promise<SearchAnswer>;
  readonly createScheduledMessage: (request: CreateScheduledMessageRequest) => Promise<ScheduledMessage>;
  readonly previewScheduledMessage: (query: PreviewScheduledMessageQuery) => Promise<readonly IsoTime[]>;
}

interface CallsOptions {
  readonly client: CallsClient;
  readonly heard: (event: CookoutEvent) => void;
  readonly subscriptionChanged: (change: SubscriptionChange) => void;
  readonly changed: () => void;
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

function createBoardCalls(options: CallsOptions): BoardCalls {
  const { client, heard } = options;
  const closing = createThreadClosing({
    changed: (parent) => {
      heard({ parent, type: "thread" });
    },
    client,
    refused: options.changed,
  });
  return {
    ack: createMessageAcks(client),
    close: closing.close,
    closingRefusal: closing.refusal,
    createChannel: async (request) => {
      const { channel } = await client.createChannel(request);
      heard({ channel, type: "channel" });
      heard({ subscription: { channel: channel.name, subscribed: true }, type: "subscription" });
      return channel;
    },
    createScheduledMessage: async (request) => {
      const { scheduledMessage } = await client.createScheduledMessage(request);
      return scheduledMessage;
    },
    previewScheduledMessage: async (query) => {
      const { nextRuns } = await client.previewScheduledMessage(query);
      return nextRuns;
    },
    reopen: closing.reopen,
    search: async (request) => {
      const answer = await answerOf(client, request);
      return answer;
    },
    setSubscribed: subscribing(options),
  };
}

export { type BoardCalls, type CallsClient, createBoardCalls };

import type { BoardCalls, CallsClient } from "./board-calls.ts";
import type { ChannelName, CookoutEvent } from "../../sdk/index.ts";
import type { ChannelsClient, ChannelsState, WebhookCommandsClient, WebhookCommandsState } from "./listed-slices.ts";
import type { MessagesClient, MessagesPart } from "./messages-part.ts";
import type { Schedules, SchedulesClient } from "./schedules-slice.ts";
import type { SubscriptionChange, SubscriptionsState } from "./subscriptions-slice.ts";
import { channelsSlice, webhookCommandsSlice } from "./listed-slices.ts";
import { hrefOf, locationOf } from "../../paths/index.ts";
import type { Part } from "./slice.ts";
import { createBoardCalls } from "./board-calls.ts";
import { createMessagesPart } from "./messages-part.ts";
import { createPart } from "./slice.ts";
import { schedulesSlice } from "./schedules-slice.ts";
import { subscriptionsSlice } from "./subscriptions-slice.ts";

type OwnClient = CallsClient & ChannelsClient & WebhookCommandsClient & MessagesClient & SchedulesClient;

interface OwnParts {
  readonly channels: Part<ChannelsState>;
  readonly webhookCommands: Part<WebhookCommandsState>;
  readonly schedules: Part<Schedules>;
  readonly subscriptions: Part<SubscriptionsState, SubscriptionChange>;
  readonly messages: MessagesPart;
  readonly calls: BoardCalls;
  readonly notice: () => ChannelName | null;
  readonly dismissNotice: () => void;
  readonly apply: (event: CookoutEvent) => void;
  readonly back: () => void;
}

interface OwnOptions {
  readonly client: OwnClient;
  readonly pageSize: number;
  readonly changed: () => void;
}

function leftIfOpen(name: ChannelName): boolean {
  const { route } = locationOf(globalThis.location.hash);
  if ((route.name === "channel" || route.name === "thread") && route.channel === name) {
    globalThis.location.hash = hrefOf({ name: "inbox", selected: null });
    return true;
  }
  return false;
}

function isMissing(state: ChannelsState, event: CookoutEvent): boolean {
  return (
    event.type === "message" &&
    state.status === "loaded" &&
    !state.channels.some((channel) => channel.name === event.message.channel)
  );
}

interface Listed {
  readonly channels: Part<ChannelsState>;
  readonly webhookCommands: Part<WebhookCommandsState>;
  readonly schedules: Part<Schedules>;
  readonly subscriptions: Part<SubscriptionsState, SubscriptionChange>;
}

function listedParts({ changed, client }: OwnOptions): Listed {
  return {
    channels: createPart({ changed, client, slice: channelsSlice }),
    schedules: createPart({ changed, client, slice: schedulesSlice }),
    subscriptions: createPart({ changed, client, slice: subscriptionsSlice }),
    webhookCommands: createPart({ changed, client, slice: webhookCommandsSlice }),
  };
}

function createOwnParts(options: OwnOptions): OwnParts {
  const { changed } = options;
  const { channels, webhookCommands: commands, schedules, subscriptions } = listedParts(options);
  const messages = createMessagesPart(options);
  let notice: ChannelName | null = null;
  function apply(event: CookoutEvent): void {
    if (event.type === "channel-deleted" && leftIfOpen(event.channel.name)) {
      notice = event.channel.name;
      changed();
    }
    const missing = isMissing(channels.state(), event);
    for (const part of [channels, commands, schedules, subscriptions, messages]) {
      part.apply(event);
    }
    if (missing) {
      channels.back();
    }
  }
  return {
    apply,
    back: () => {
      for (const part of [channels, commands, schedules, subscriptions, messages]) {
        part.back();
      }
    },
    calls: createBoardCalls({
      changed,
      client: options.client,
      heard: apply,
      keepResults: messages.keepResults,
      subscriptionChanged: subscriptions.apply,
    }),
    channels,
    dismissNotice: () => {
      notice = null;
      changed();
    },
    messages,
    notice: () => notice,
    schedules,
    subscriptions,
    webhookCommands: commands,
  };
}

export type { Schedules } from "./schedules-slice.ts";
export { type OwnClient, type OwnParts, createOwnParts };

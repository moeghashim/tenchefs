import type { Channel, ChannelName, CookoutClient, CookoutEvent } from "../../sdk/index.ts";
import type { Failure } from "./failure.ts";
import type { Slice } from "./slice.ts";
import type { WebhookCommand } from "../../webhook-commands/index.ts";
import { failure } from "./failure.ts";

type ChannelsState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly channels: readonly Channel[] }
  | Failure;

type WebhookCommandsState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly webhookCommands: readonly WebhookCommand[] }
  | Failure;

type ChannelsClient = Pick<CookoutClient, "listChannels">;

type WebhookCommandsClient = Pick<CookoutClient, "listCommands">;

const LOADING = { status: "loading" } as const;

interface Named {
  readonly name: string;
}

function withNamed<Item extends Named>(items: readonly Item[], changed: Item): readonly Item[] {
  const held = items.find((item) => item.name === changed.name) ?? null;
  if (held !== null && JSON.stringify(held) === JSON.stringify(changed)) {
    return items;
  }
  const others = items.filter((item) => item.name !== changed.name);
  return [...others, changed].toSorted((first, second) => first.name.localeCompare(second.name));
}

function withoutChannel(state: ChannelsState, name: ChannelName): ChannelsState {
  if (state.status !== "loaded" || !state.channels.some((channel) => channel.name === name)) {
    return state;
  }
  return { channels: state.channels.filter((channel) => channel.name !== name), status: "loaded" };
}

function withChannel(state: ChannelsState, added: Channel): ChannelsState {
  if (state.status !== "loaded") {
    return state;
  }
  const channels = withNamed(state.channels, added);
  if (channels === state.channels) {
    return state;
  }
  return { channels, status: "loaded" };
}

function channelsApplied(state: ChannelsState, event: CookoutEvent): ChannelsState {
  if (event.type === "channel") {
    return withChannel(state, event.channel);
  }
  if (event.type === "channel-deleted") {
    return withoutChannel(state, event.channel.name);
  }
  return state;
}

const channelsSlice: Slice<ChannelsState, ChannelsClient> = {
  apply: channelsApplied,
  empty: LOADING,
  read: async (client) => {
    try {
      const { channels } = await client.listChannels();
      return { channels, status: "loaded" };
    } catch (error: unknown) {
      return failure(error);
    }
  },
};

function webhookCommandsApplied(state: WebhookCommandsState, event: CookoutEvent): WebhookCommandsState {
  if (event.type !== "command" || state.status !== "loaded") {
    return state;
  }
  const commands = withNamed(state.webhookCommands, event.command);
  if (commands === state.webhookCommands) {
    return state;
  }
  return { status: "loaded", webhookCommands: commands };
}

const webhookCommandsSlice: Slice<WebhookCommandsState, WebhookCommandsClient> = {
  apply: webhookCommandsApplied,
  empty: LOADING,
  read: async (client) => {
    try {
      const { commands } = await client.listCommands();
      return { status: "loaded", webhookCommands: commands };
    } catch (error: unknown) {
      return failure(error);
    }
  },
};

export {
  type ChannelsClient,
  type ChannelsState,
  type WebhookCommandsClient,
  type WebhookCommandsState,
  channelsSlice,
  webhookCommandsSlice,
};

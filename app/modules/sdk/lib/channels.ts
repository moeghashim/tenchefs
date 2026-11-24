import type { ChannelResponse, CreateChannelRequest, ListChannelsResponse } from "../../channels/index.ts";
import { channelPath, channelsPath } from "../../channels/index.ts";
import { getJson, send } from "./request.ts";
import { isChannelResponse, isListChannelsResponse } from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { ScheduledMessageCalls } from "../../scheduled-messages/client.ts";
import { scheduledMessageCalls } from "./scheduled-messages.ts";

interface ChannelCalls {
  readonly createChannel: (request: CreateChannelRequest) => Promise<ChannelResponse>;
  readonly listChannels: () => Promise<ListChannelsResponse>;
  readonly listSubscribedChannels: () => Promise<ListChannelsResponse>;
  readonly getChannel: (name: string) => Promise<ChannelResponse>;
  readonly deleteChannel: (name: string) => Promise<ChannelResponse>;
}

function channelCalls(server: ClientConnection): ChannelCalls & ScheduledMessageCalls {
  return {
    ...scheduledMessageCalls(server),
    createChannel: async (body) => {
      const created = await send(server, { body, isExpected: isChannelResponse, method: "POST", path: channelsPath });
      return created;
    },
    deleteChannel: async (name) => {
      const deleted = await send(server, {
        isExpected: isChannelResponse,
        method: "DELETE",
        params: { name },
        path: channelPath,
      });
      return deleted;
    },
    getChannel: async (name) => {
      const found = await send(server, {
        isExpected: isChannelResponse,
        method: "GET",
        params: { name },
        path: channelPath,
      });
      return found;
    },
    listChannels: async () => {
      const listed = await getJson(server, channelsPath, isListChannelsResponse);
      return listed;
    },
    listSubscribedChannels: async () => {
      const listed = await send(server, {
        isExpected: isListChannelsResponse,
        method: "GET",
        path: channelsPath,
        query: { subscribed: "true" },
      });
      return listed;
    },
  };
}

export type {
  Channel,
  ChannelName,
  ChannelResponse,
  CreateChannelRequest,
  ListChannelsResponse,
} from "../../channels/index.ts";
export { channelCalls };

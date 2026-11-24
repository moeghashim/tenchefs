import type {
  ListScheduledMessagesQuery,
  ScheduledMessageId,
  ScheduledMessageResponse,
} from "../../scheduled-messages/index.ts";
import { getJson, send } from "./request.ts";
import {
  isListScheduledMessagesResponse,
  isScheduledMessagePreviewResponse,
  isScheduledMessageResponse,
} from "./generated/validators.js";
import {
  scheduledMessagePath,
  scheduledMessagePausePath,
  scheduledMessagePreviewPath,
  scheduledMessageResumePath,
  scheduledMessagesPath,
} from "../../scheduled-messages/index.ts";
import type { ClientConnection } from "./request.ts";
import type { ScheduledMessageCalls } from "../../scheduled-messages/client.ts";

type Change = (id: ScheduledMessageId) => Promise<ScheduledMessageResponse>;

function changeCall(server: ClientConnection, path: string, method: "GET" | "POST" | "DELETE"): Change {
  return async (id) => {
    const changed = await send(server, {
      isExpected: isScheduledMessageResponse,
      method,
      params: { id: String(id) },
      path,
    });
    return changed;
  };
}

function listCall(server: ClientConnection): ScheduledMessageCalls["listScheduledMessages"] {
  return async (query: ListScheduledMessagesQuery = {}) => {
    const { channel } = query;
    if (channel === "" || typeof channel !== "string") {
      const listed = await getJson(server, scheduledMessagesPath, isListScheduledMessagesResponse);
      return listed;
    }
    const listed = await send(server, {
      isExpected: isListScheduledMessagesResponse,
      method: "GET",
      path: scheduledMessagesPath,
      query: { channel },
    });
    return listed;
  };
}

function scheduledMessageCalls(server: ClientConnection): ScheduledMessageCalls {
  return {
    createScheduledMessage: async (body) => {
      const created = await send(server, {
        body,
        isExpected: isScheduledMessageResponse,
        method: "POST",
        path: scheduledMessagesPath,
      });
      return created;
    },
    deleteScheduledMessage: changeCall(server, scheduledMessagePath, "DELETE"),
    editScheduledMessage: async (id, body) => {
      const edited = await send(server, {
        body,
        isExpected: isScheduledMessageResponse,
        method: "PATCH",
        params: { id: String(id) },
        path: scheduledMessagePath,
      });
      return edited;
    },
    getScheduledMessage: changeCall(server, scheduledMessagePath, "GET"),
    listScheduledMessages: listCall(server),
    pauseScheduledMessage: changeCall(server, scheduledMessagePausePath, "POST"),
    previewScheduledMessage: async (query) => {
      const previewed = await send(server, {
        isExpected: isScheduledMessagePreviewResponse,
        method: "GET",
        path: scheduledMessagePreviewPath,
        query: { ...query },
      });
      return previewed;
    },
    resumeScheduledMessage: changeCall(server, scheduledMessageResumePath, "POST"),
  };
}

export type {
  CreateScheduledMessageRequest,
  EditScheduledMessageRequest,
  ListScheduledMessagesQuery,
  ListScheduledMessagesResponse,
  PreviewScheduledMessageQuery,
  ScheduledMessage,
  ScheduledMessageId,
  ScheduledMessagePreviewResponse,
  ScheduledMessageResponse,
  ScheduledMessageRun,
} from "../../scheduled-messages/index.ts";
export { scheduledMessageCalls };

import type {
  AttachmentCalls,
  ClosedThreadCalls,
  DeletedMessageResponse,
  MessageDeleteCalls,
  OpenThreadCalls,
  SearchCalls,
} from "../../messages/client.ts";
import type {
  ListMessagesQuery,
  ListMessagesResponse,
  MessageId,
  MessageResponse,
  ReactionName,
  ReactionsResponse,
  ThreadResponse,
  TopLevelMessageResponse,
} from "../../messages/index.ts";
import { attachmentCalls, postBody } from "./attachments.ts";
import {
  channelMessagesPath,
  closedPath,
  messagePath,
  messagesPath,
  reactionPath,
  threadPath,
} from "../../messages/index.ts";
import {
  isDeletedMessageResponse,
  isListMessagesResponse,
  isListOpenThreadsResponse,
  isMessageResponse,
  isReactionsResponse,
  isSearchResponse,
  isThreadResponse,
  isTopLevelMessageResponse,
} from "./generated/validators.js";
import { openThreadsPath, searchQueryParam } from "../../messages/client.ts";
import type { ClientConnection } from "./request.ts";
import type { CreateMessageRequest } from "./attachments.ts";
import { searchPath } from "../../search/index.ts";
import { send } from "./request.ts";

interface MessageCalls extends AttachmentCalls, ClosedThreadCalls, MessageDeleteCalls, OpenThreadCalls, SearchCalls {
  readonly createMessage: (request: CreateMessageRequest) => Promise<MessageResponse>;
  readonly listMessages: (channel: string, query?: ListMessagesQuery) => Promise<ListMessagesResponse>;
  readonly getThread: (messageId: MessageId) => Promise<ThreadResponse>;
  readonly react: (messageId: MessageId, reaction: ReactionName) => Promise<ReactionsResponse>;
  readonly unreact: (messageId: MessageId, reaction: ReactionName) => Promise<ReactionsResponse>;
}

function closedCall(server: ClientConnection, method: "PUT" | "DELETE") {
  return async (messageId: MessageId): Promise<TopLevelMessageResponse> => {
    const params = { id: String(messageId) };
    const answer = await send(server, { isExpected: isTopLevelMessageResponse, method, params, path: closedPath });
    return answer;
  };
}

function deleteCall(server: ClientConnection) {
  return async (messageId: MessageId): Promise<DeletedMessageResponse> => {
    const params = { id: String(messageId) };
    const answer = await send(server, {
      isExpected: isDeletedMessageResponse,
      method: "DELETE",
      params,
      path: messagePath,
    });
    return answer;
  };
}

function reactionCall(server: ClientConnection, method: "PUT" | "DELETE") {
  return async (messageId: MessageId, reaction: ReactionName): Promise<ReactionsResponse> => {
    const params = { id: String(messageId), reaction };
    const answer = await send(server, { isExpected: isReactionsResponse, method, params, path: reactionPath });
    return answer;
  };
}

const NOT_ALL = {};

function allQuery(all: boolean | undefined): { readonly all?: "true" } {
  if (all === true) {
    return { all: "true" };
  }
  return NOT_ALL;
}

function messageCalls(server: ClientConnection): MessageCalls {
  return {
    ...attachmentCalls(server),
    closeThread: closedCall(server, "PUT"),
    createMessage: async (request) => {
      const body = postBody(request);
      const posted = await send(server, { body, isExpected: isMessageResponse, method: "POST", path: messagesPath });
      return posted;
    },
    deleteMessage: deleteCall(server),
    getThread: async (messageId) => {
      const params = { id: String(messageId) };
      const thread = await send(server, { isExpected: isThreadResponse, method: "GET", params, path: threadPath });
      return thread;
    },
    listMessages: async (channel, { before, limit } = {}) => {
      const page = await send(server, {
        isExpected: isListMessagesResponse,
        method: "GET",
        params: { name: channel },
        path: channelMessagesPath,
        query: { before, limit },
      });
      return page;
    },
    listOpenThreads: async ({ all, cursor, limit } = {}) => {
      const page = await send(server, {
        isExpected: isListOpenThreadsResponse,
        method: "GET",
        path: openThreadsPath,
        query: { ...allQuery(all), cursor, limit },
      });
      return page;
    },
    react: reactionCall(server, "PUT"),
    reopenThread: closedCall(server, "DELETE"),
    search: async ({ cursor, limit, query, sort }) => {
      const page = await send(server, {
        isExpected: isSearchResponse,
        method: "GET",
        path: searchPath,
        query: { cursor, limit, [searchQueryParam]: query, sort },
      });
      return page;
    },
    unreact: reactionCall(server, "DELETE"),
  };
}

export type {
  ListMessagesQuery,
  ListMessagesResponse,
  MessageId,
  MessageResponse,
  ReactionName,
  ReactionsResponse,
  ThreadResponse,
} from "../../messages/index.ts";
export type { CreateMessageRequest } from "./attachments.ts";
export { messageCalls };

/**
 * Messages on the backend: the `Messages` service over `Storage`, and the
 * routes that post a message, get a thread from any message in it, page
 * back through a channel and search every channel by words. `Messages` also publishes each message the moment
 * it is stored to an in-process hub, which `posted` subscribes to, for live
 * updates. The author's name and owner are copied onto each
 * message, so they survive the identity being deleted. Routes sit behind the
 * server's token gate.
 */
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  MessageResponseSchema,
  ReactionsResponseSchema,
  ThreadResponseSchema,
  TopLevelMessageResponseSchema,
} from "./lib/server/wire.ts";
import { channelMessagesPath, closedPath, reactionPath, threadPath } from "./index.ts";
import { listingResponseSchemas, listingRoutes } from "./lib/server/listings.ts";
import { Caller } from "../identities/server.ts";
import { Effect } from "effect";
import type { ListingNeeds } from "./lib/server/listings.ts";
import { Messages } from "./lib/server/service.ts";
import type { Route } from "../http/server.ts";
import { postRoutes } from "./lib/server/routes.ts";
import { threadIdOf } from "./lib/server/refusals.ts";

const ALL_ERRORS = { errors: "all" } as const;
const PATH_BASE = "http://cookout.invalid";
const DIGITS = /^\d+$/u;

const threadRoute: Route<Messages> = {
  handle: (params) =>
    Effect.gen(function* getThreadRoute() {
      const id = yield* threadIdOf(String(params["id"]));
      const messages = yield* Messages;
      const thread = yield* messages.thread(id);
      return yield* HttpServerResponse.schemaJson(ThreadResponseSchema)(thread);
    }),
  method: "GET",
  path: threadPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

type ReactionChange = (messages: Messages["Service"]) => Messages["Service"]["react"];

function reactionRoute(method: "PUT" | "DELETE", change: ReactionChange): Route<Caller | Messages> {
  return {
    handle: (params) =>
      Effect.gen(function* reactionChangeRoute() {
        const id = yield* threadIdOf(String(params["id"]));
        const caller = yield* Caller;
        const messages = yield* Messages;
        const answer = yield* change(messages)(caller, id, String(params["reaction"]));
        return yield* HttpServerResponse.schemaJson(ReactionsResponseSchema)(answer);
      }),
    method,
    path: reactionPath,
    segments: { id: (segment) => DIGITS.test(segment) },
  };
}

const pageRoute: Route<Messages> = {
  handle: (params) =>
    Effect.gen(function* channelPageRoute() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
      const query = yield* HttpServerRequest.schemaSearchParams(ListMessagesQuerySchema, ALL_ERRORS).pipe(
        Effect.provideService(HttpServerRequest.ParsedSearchParams, search),
      );
      const messages = yield* Messages;
      const page = yield* messages.page(String(params["name"]), query);
      return yield* HttpServerResponse.schemaJson(ListMessagesResponseSchema)(page);
    }),
  method: "GET",
  path: channelMessagesPath,
};

const closeRoute: Route<Caller | Messages> = {
  handle: (params) =>
    Effect.gen(function* closeThreadRoute() {
      const id = yield* threadIdOf(String(params["id"]));
      const caller = yield* Caller;
      const messages = yield* Messages;
      const answer = yield* messages.closeThread(caller, id);
      return yield* HttpServerResponse.schemaJson(TopLevelMessageResponseSchema)(answer);
    }),
  method: "PUT",
  path: closedPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

const reopenRoute: Route<Messages> = {
  handle: (params) =>
    Effect.gen(function* reopenThreadRoute() {
      const id = yield* threadIdOf(String(params["id"]));
      const messages = yield* Messages;
      const answer = yield* messages.reopenThread(id);
      return yield* HttpServerResponse.schemaJson(TopLevelMessageResponseSchema)(answer);
    }),
  method: "DELETE",
  path: closedPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

export { Messages } from "./lib/server/service.ts";
export { messagesLayer } from "./lib/server/layer.ts";
export { ReadReceipts, readReceiptsLayer } from "./lib/server/read-receipts.ts";
export { Reactions, reactionCounter, reactionsLayer } from "./lib/server/reactions.ts";
export { messageNotFound } from "./lib/server/refusals.ts";

/** The Schemas of a message and its ID, for other modules' answers that hold messages. */
export {
  AuthorSchema,
  MessageIdSchema,
  MessageSchema,
  ScheduledMessageIdSchema,
  TextSchema,
  ReactionCountSchema,
  ReactionSchema,
  ReadReceiptSchema,
  TopLevelMessageSchema,
} from "./lib/server/wire.ts";

/** The Schema of a page query (`before` and `limit`), for other pages that follow a channel page's rules. */
export { ListMessagesQuerySchema as PageQuerySchema } from "./lib/server/wire.ts";

/**
 * The message routes, for the server's route list. They need `Caller`, which the token gate provides, `Messages`,
 * which `messagesLayer` provides, and `Storage`.
 */
export const messageRoutes: readonly Route<ListingNeeds>[] = [
  ...postRoutes,
  threadRoute,
  pageRoute,
  reactionRoute("PUT", (messages) => messages.react),
  reactionRoute("DELETE", (messages) => messages.unreact),
  closeRoute,
  reopenRoute,
  ...listingRoutes,
];

/**
 * The response Schemas of the search route, for the SDK's generated validators. They are their own group, since the
 * answer's types live in the search module.
 */
export { searchResponseSchemas } from "./lib/server/listings.ts";

/** The response Schemas of the message routes, for the SDK's generated validators. */
export const messageResponseSchemas = {
  ListMessagesResponse: ListMessagesResponseSchema,
  MessageResponse: MessageResponseSchema,
  ReactionsResponse: ReactionsResponseSchema,
  ThreadResponse: ThreadResponseSchema,
  TopLevelMessageResponse: TopLevelMessageResponseSchema,
  ...listingResponseSchemas,
};

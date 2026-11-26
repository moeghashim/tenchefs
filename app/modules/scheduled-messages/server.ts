/**
 * Scheduled messages on the backend: the `ScheduledMessages` service over `Storage`, its scheduler, and the routes
 * that create, list, get, edit, pause, resume and delete schedules, and preview a timing's next runs. The scheduler is one fiber that reads what is due from
 * storage, as ADR 0066's nudge scheduler does: it posts each schedule's latest due run through `Messages`, so a post's
 * mentions, Inbox items and live events are a typed post's, skips a run 10 minutes or more late, and sleeps until the
 * soonest next run or a change wakes it. A scheduled post is not its creator's Activity (Matt, 2026-11-24,
 * mattpocock/cookout#386). Any identity can create a schedule; its creator, an agent creator's owner or an admin can
 * edit, pause, resume or delete it. An edit changes future runs only. The routes sit behind the server's token gate.
 */
import {
  CreateScheduledMessageRequestSchema,
  EditScheduledMessageRequestSchema,
  ListScheduledMessagesQuerySchema,
  ListScheduledMessagesResponseSchema,
  PreviewScheduledMessageQuerySchema,
  ScheduledMessageEventSchema,
  ScheduledMessagePreviewResponseSchema,
  ScheduledMessageResponseSchema,
} from "./lib/server/wire.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  scheduledMessagePath,
  scheduledMessagePausePath,
  scheduledMessagePreviewPath,
  scheduledMessageResumePath,
  scheduledMessagesPath,
} from "./index.ts";
import { Caller } from "../identities/server.ts";
import { Effect } from "effect";
import type { Route } from "../http/server.ts";
import { ScheduledMessages } from "./lib/server/service.ts";
import { previewOf } from "./lib/server/edit.ts";
import { scheduledMessageIdOf } from "./lib/server/refusals.ts";

type Change = "pause" | "resume" | "remove";

const CREATED = 201;
const PATH_BASE = "http://cookout.invalid";

function changeRoute(change: Change, path: string, method: "POST" | "DELETE"): Route<Caller | ScheduledMessages> {
  return {
    handle: (params) =>
      Effect.gen(function* changeScheduleRoute() {
        const caller = yield* Caller;
        const service = yield* ScheduledMessages;
        const id = yield* scheduledMessageIdOf(String(params["id"]));
        const scheduledMessage = yield* service[change](caller, id);
        return yield* HttpServerResponse.schemaJson(ScheduledMessageResponseSchema)({ scheduledMessage });
      }),
    method,
    path,
  };
}

/** The Scheduled message routes, for the server's route list. They need `ScheduledMessages` and `Caller`. */
export const scheduledMessageRoutes: readonly Route<Caller | ScheduledMessages>[] = [
  {
    handle: () =>
      Effect.gen(function* createScheduleRoute() {
        const asked = yield* HttpServerRequest.schemaBodyJson(CreateScheduledMessageRequestSchema, { errors: "all" });
        const caller = yield* Caller;
        const service = yield* ScheduledMessages;
        const scheduledMessage = yield* service.create(caller, asked);
        return yield* HttpServerResponse.schemaJson(ScheduledMessageResponseSchema)(
          { scheduledMessage },
          { status: CREATED },
        );
      }),
    method: "POST",
    path: scheduledMessagesPath,
  },
  {
    handle: () =>
      Effect.gen(function* listSchedulesRoute() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
        const query = yield* HttpServerRequest.schemaSearchParams(ListScheduledMessagesQuerySchema, {
          errors: "all",
        }).pipe(Effect.provideService(HttpServerRequest.ParsedSearchParams, search));
        const service = yield* ScheduledMessages;
        const scheduledMessages = yield* service.list(query.channel);
        return yield* HttpServerResponse.schemaJson(ListScheduledMessagesResponseSchema)({ scheduledMessages });
      }),
    method: "GET",
    path: scheduledMessagesPath,
  },
  {
    handle: () =>
      Effect.gen(function* previewScheduleRoute() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
        const query = yield* HttpServerRequest.schemaSearchParams(PreviewScheduledMessageQuerySchema, {
          errors: "all",
        }).pipe(Effect.provideService(HttpServerRequest.ParsedSearchParams, search));
        const nextRuns = yield* previewOf(query);
        return yield* HttpServerResponse.schemaJson(ScheduledMessagePreviewResponseSchema)({ nextRuns });
      }),
    method: "GET",
    path: scheduledMessagePreviewPath,
  },
  {
    handle: (params) =>
      Effect.gen(function* getScheduleRoute() {
        const service = yield* ScheduledMessages;
        const id = yield* scheduledMessageIdOf(String(params["id"]));
        const scheduledMessage = yield* service.get(id);
        return yield* HttpServerResponse.schemaJson(ScheduledMessageResponseSchema)({ scheduledMessage });
      }),
    method: "GET",
    path: scheduledMessagePath,
  },
  {
    handle: (params) =>
      Effect.gen(function* editScheduleRoute() {
        const asked = yield* HttpServerRequest.schemaBodyJson(EditScheduledMessageRequestSchema, { errors: "all" });
        const caller = yield* Caller;
        const service = yield* ScheduledMessages;
        const id = yield* scheduledMessageIdOf(String(params["id"]));
        const scheduledMessage = yield* service.edit(caller, id, asked);
        return yield* HttpServerResponse.schemaJson(ScheduledMessageResponseSchema)({ scheduledMessage });
      }),
    method: "PATCH",
    path: scheduledMessagePath,
  },
  changeRoute("pause", scheduledMessagePausePath, "POST"),
  changeRoute("resume", scheduledMessageResumePath, "POST"),
  changeRoute("remove", scheduledMessagePath, "DELETE"),
];

/**
 * The `ScheduledMessages` service and its scheduler fiber, which lives as long as the Layer. It needs `Storage`,
 * `Messages` to post through, and `IdentityChanges` to wake on.
 */
export { scheduledMessagesLayer } from "./lib/server/layer.ts";

/** The `scheduled-message` live event's Schema, for the events stream. */
export { ScheduledMessageEventSchema } from "./lib/server/wire.ts";

/** The `ScheduledMessages` service: create, list, get, edit, pause, resume and delete Scheduled messages. */
export { ScheduledMessages } from "./lib/server/service.ts";

/** The response Schemas of the Scheduled message routes, for the SDK's generated validators. */
export const scheduledMessageResponseSchemas = {
  ListScheduledMessagesResponse: ListScheduledMessagesResponseSchema,
  ScheduledMessageEvent: ScheduledMessageEventSchema,
  ScheduledMessagePreviewResponse: ScheduledMessagePreviewResponseSchema,
  ScheduledMessageResponse: ScheduledMessageResponseSchema,
};

export { messageDeleteResponseSchemas, messageResponseSchemas, searchResponseSchemas } from "../messages/server.ts";

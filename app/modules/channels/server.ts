/**
 * Channels on the backend: the `Channels` service over `Storage`, and the
 * routes that create, list, get and delete channels. Any identity can create a
 * channel, which subscribes it; only an admin can delete one. The routes sit behind the server's token gate.
 */
import { Array as Arr, Context, DateTime, Effect, Layer, PubSub } from "effect";
import { AssetStore, Storage } from "../storage/server.ts";
import { Caller, requireAdmin } from "../identities/server.ts";
import {
  ChannelResponseSchema,
  CreateChannelRequestSchema,
  ListChannelsQuerySchema,
  ListChannelsResponseSchema,
} from "./lib/server/wire.ts";
import type { DeletedChannel, StorageUnavailable } from "../storage/server.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { channelPath, channelsPath, isChannelName } from "./index.ts";
import type { Channel } from "./index.ts";
import type { IsoTime } from "../time/index.ts";
import type { Refusal } from "../http/index.ts";
import type { Route } from "../http/server.ts";
import type { Scope } from "effect";
import { echoed } from "../http/index.ts";
import { isoTimeOf } from "../time/server.ts";

type NewChannel = typeof CreateChannelRequestSchema.Type;

interface CreatedChannel {
  readonly channel: Channel;
  readonly creator: Caller["Service"]["name"];
}

const CONFLICT = 409;
const CREATED = 201;
const NOT_FOUND = 404;
const PATH_BASE = "http://cookout.invalid";

function channelExists(name: string): Refusal {
  return { code: "channel_exists", message: `The channel ${name} already exists.`, status: CONFLICT };
}

function missingChannel(name: string): Refusal {
  return { code: "channel_not_found", message: `There is no channel named ${echoed(name)}.`, status: NOT_FOUND };
}

function stamped(fields: NewChannel, createdAt: IsoTime): Channel {
  if (typeof fields.description === "string") {
    return { createdAt, description: fields.description, name: fields.name };
  }
  return { createdAt, name: fields.name };
}

interface Publishers {
  readonly created: (created: CreatedChannel) => Effect.Effect<boolean>;
  readonly deleted: (channel: Channel) => Effect.Effect<boolean>;
}

interface Removal extends DeletedChannel {
  readonly assets: AssetStore["Service"];
}

function removeBytes({ assets, attachments, channel }: Removal): Effect.Effect<void> {
  if (Arr.isReadonlyArrayEmpty(attachments)) {
    return Effect.void;
  }
  function logFailure({ message }: { readonly message: string }): Effect.Effect<void> {
    return Effect.logError(
      `The bytes of ${String(attachments.length)} attachments of the deleted channel ${channel.name} couldn't be removed from the asset store (${Arr.join(attachments, ", ")}): ${message}`,
    );
  }
  return assets.remove(attachments).pipe(Effect.catchTag("StorageUnavailable", logFailure));
}

interface ChannelsNeeds {
  readonly assets: AssetStore["Service"];
  readonly publish: Publishers;
  readonly storage: Storage["Service"];
}

function channelsOn({ assets, publish, storage }: ChannelsNeeds): Omit<ChannelsService, "created" | "deleted"> {
  return {
    create: (creator, fields) =>
      Effect.gen(function* createChannel() {
        const now = yield* DateTime.now;
        const channel = stamped(fields, isoTimeOf(now));
        const outcome = yield* storage.createChannel(channel, creator.name);
        if (outcome === "name_taken") {
          return yield* Effect.fail(channelExists(channel.name));
        }
        yield* publish.created({ channel, creator: creator.name });
        return channel;
      }),
    get: (name) =>
      Effect.gen(function* getChannel() {
        if (!isChannelName(name)) {
          return yield* Effect.fail(missingChannel(name));
        }
        const found = yield* storage.findChannel(name);
        if (typeof found === "object") {
          return found;
        }
        return yield* Effect.fail(missingChannel(name));
      }),
    list: Effect.suspend(() => storage.listChannels()),
    listSubscribed: (identity) => storage.listSubscribedChannels(identity.name),
    remove: (name) =>
      Effect.gen(function* deleteChannel() {
        if (!isChannelName(name)) {
          return yield* Effect.fail(missingChannel(name));
        }
        const deleted = yield* storage.deleteChannel(name);
        if (typeof deleted !== "object") {
          return yield* Effect.fail(missingChannel(name));
        }
        yield* removeBytes({ assets, ...deleted });
        return yield* Effect.as(publish.deleted(deleted.channel), deleted.channel);
      }),
  };
}

/**
 * The refusal for a channel that doesn't exist, 404 `channel_not_found`, for
 * every route that names a channel.
 */
export const channelNotFound: (name: string) => Refusal = missingChannel;

export interface ChannelsService {
  /**
   * Makes a channel, stamped with the current time, and subscribes `creator` to it in the same storage change.
   * Refuses with 409 `channel_exists` when the name is in use.
   */
  readonly create: (
    creator: Caller["Service"],
    channel: NewChannel,
  ) => Effect.Effect<Channel, Refusal | StorageUnavailable>;
  /**
   * Every channel created from now on, with its creator, for as long as the scope lasts: the live stream sends each
   * as a `channel` event, and as a `subscription` event to its creator.
   */
  readonly created: Effect.Effect<PubSub.Subscription<CreatedChannel>, never, Scope.Scope>;
  /** Every channel deleted from now on, for as long as the scope lasts: the live stream sends each as a `channel-deleted` event. */
  readonly deleted: Effect.Effect<PubSub.Subscription<Channel>, never, Scope.Scope>;
  /** Every channel, sorted by name. */
  readonly list: Effect.Effect<readonly Channel[], StorageUnavailable>;
  /** The channels `identity` subscribes to, sorted by name. */
  readonly listSubscribed: (identity: Caller["Service"]) => Effect.Effect<readonly Channel[], StorageUnavailable>;
  /** The channel named `name`. Refuses with 404 `channel_not_found` when there is none. */
  readonly get: (name: string) => Effect.Effect<Channel, Refusal | StorageUnavailable>;
  /**
   * Deletes the channel named `name` and everything in it: its messages and threads, their mentions, follows,
   * attachments, subscriptions, read positions, command calls and pending deliveries. Once that has committed, it
   * removes the attachments' bytes from the asset store, and only logs a failure to, so the delete stands. Refuses with 404 `channel_not_found`
   * when there is none. Answers the deleted channel.
   */
  readonly remove: (name: string) => Effect.Effect<Channel, Refusal | StorageUnavailable>;
}

export class Channels extends Context.Service<Channels, ChannelsService>()(
  "@ai-hero/cookout/channels/server/Channels",
) {}

/** `Channels` on the running `Storage` and `AssetStore`. */
export const channelsLayer: Layer.Layer<Channels, never, Storage | AssetStore> = Layer.effect(
  Channels,
  Effect.gen(function* channelsOnStorage() {
    const storage = yield* Storage;
    const assets = yield* AssetStore;
    const createdHub = yield* PubSub.unbounded<CreatedChannel>();
    const deletedHub = yield* PubSub.unbounded<Channel>();
    const publish: Publishers = {
      created: (created) => PubSub.publish(createdHub, created),
      deleted: (channel) => PubSub.publish(deletedHub, channel),
    };
    return {
      ...channelsOn({ assets, publish, storage }),
      created: PubSub.subscribe(createdHub),
      deleted: PubSub.subscribe(deletedHub),
    };
  }),
);

/**
 * The channel routes, for the server's route list. They need `Channels`, which `channelsLayer` provides, and
 * `Caller`, which the token gate provides.
 */
export const channelRoutes: readonly Route<Caller | Channels>[] = [
  {
    handle: () =>
      Effect.gen(function* createChannelRoute() {
        const fields = yield* HttpServerRequest.schemaBodyJson(CreateChannelRequestSchema, { errors: "all" });
        const caller = yield* Caller;
        const channels = yield* Channels;
        const channel = yield* channels.create(caller, fields);
        return yield* HttpServerResponse.schemaJson(ChannelResponseSchema)({ channel }, { status: CREATED });
      }),
    method: "POST",
    path: channelsPath,
  },
  {
    handle: () =>
      Effect.gen(function* listChannelsRoute() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
        const query = yield* HttpServerRequest.schemaSearchParams(ListChannelsQuerySchema, { errors: "all" }).pipe(
          Effect.provideService(HttpServerRequest.ParsedSearchParams, search),
        );
        const service = yield* Channels;
        const respond = HttpServerResponse.schemaJson(ListChannelsResponseSchema);
        if (query.subscribed === "true") {
          const caller = yield* Caller;
          return yield* respond({ channels: yield* service.listSubscribed(caller) });
        }
        return yield* respond({ channels: yield* service.list });
      }),
    method: "GET",
    path: channelsPath,
  },
  {
    handle: (params) =>
      Effect.gen(function* getChannelRoute() {
        const channels = yield* Channels;
        const channel = yield* channels.get(String(params["name"]));
        return yield* HttpServerResponse.schemaJson(ChannelResponseSchema)({ channel });
      }),
    method: "GET",
    path: channelPath,
  },
  {
    handle: (params) =>
      Effect.gen(function* deleteChannelRoute() {
        yield* requireAdmin;
        const channels = yield* Channels;
        const channel = yield* channels.remove(String(params["name"]));
        return yield* HttpServerResponse.schemaJson(ChannelResponseSchema)({ channel });
      }),
    method: "DELETE",
    path: channelPath,
  },
];

/** The Schemas of a channel and its name, for other modules' answers that hold channels. */
export { ChannelNameSchema, ChannelSchema } from "./lib/server/wire.ts";

/** The response Schemas of the channel routes, for the SDK's generated validators. */
export const channelResponseSchemas = {
  ChannelResponse: ChannelResponseSchema,
  ListChannelsResponse: ListChannelsResponseSchema,
};

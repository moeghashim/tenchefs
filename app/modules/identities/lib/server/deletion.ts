import { Array as Arr, Effect, Predicate } from "effect";
import { AssetStore, Storage } from "../../../storage/server.ts";
import type { Caller, IdentityChanges } from "./auth.ts";
import type { Identity, IdentityName } from "../../index.ts";
import { IdentityMessageCountResponseSchema, IdentityResponseSchema } from "./wire.ts";
import { announcedDeleted, requireAdmin } from "./auth.ts";
import { identityMessageCountPath, identityPath } from "../../index.ts";
import { identityNotFound, nameParam } from "./routes.ts";
import type { DeleteIdentityResult } from "../../../storage/server.ts";
import { HttpServerResponse } from "effect/http";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";

const CONFLICT = 409;
const AVATARS_REMOVED_AT_ONCE = 100;

function hasMessages(name: IdentityName): Refusal {
  return {
    code: "has_messages",
    message: `${name} has messages on the board, so it can't be deleted. Deactivate it instead.`,
    status: CONFLICT,
  };
}

function ownsAgents(name: IdentityName, agents: readonly IdentityName[]): Refusal {
  return {
    code: "owns_agents",
    details: { agents },
    message: `${name} still owns ${Arr.join(agents, ", ")}. Delete or transfer those agents first.`,
    status: CONFLICT,
  };
}

function lastAdmin(name: IdentityName): Refusal {
  return {
    code: "last_admin",
    message: `${name} is the last admin. Make another admin before deleting it.`,
    status: CONFLICT,
  };
}

function deletedOrRefused(name: IdentityName, result: DeleteIdentityResult): Effect.Effect<Identity, Refusal> {
  if (result.status === "deleted") {
    return Effect.succeed(result.identity);
  }
  if (result.status === "has_messages") {
    return Effect.fail(hasMessages(name));
  }
  if (result.status === "owns_agents") {
    return Effect.fail(ownsAgents(name, result.agents));
  }
  if (result.status === "last_admin") {
    return Effect.fail(lastAdmin(name));
  }
  return Effect.fail(identityNotFound(name));
}

const avatarBytesRemoved: Effect.Effect<void, never, Storage | AssetStore> = Effect.gen(function* removeAvatarBytes() {
  const storage = yield* Storage;
  const assets = yield* AssetStore;
  const ids = yield* storage.avatarsToRemove(AVATARS_REMOVED_AT_ONCE);
  if (Arr.isReadonlyArrayEmpty(ids)) {
    return;
  }
  yield* assets.remove(ids).pipe(
    Effect.andThen(storage.avatarsRemoved(ids)),
    Effect.catchTag("StorageUnavailable", ({ message }: { readonly message: string }) =>
      Effect.logError(
        `The bytes of ${String(ids.length)} avatars of deleted identities couldn't be removed from the asset store (${Arr.join(ids, ", ")}): ${message}`,
      ),
    ),
  );
}).pipe(
  Effect.catchTag("StorageUnavailable", ({ message }: { readonly message: string }) =>
    Effect.logError(`The avatars of deleted identities couldn't be read to remove their bytes: ${message}`),
  ),
);

const deleteRoute: Route<Caller | Storage | AssetStore | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* deleteIdentityRoute() {
      yield* requireAdmin;
      const name = yield* nameParam(params);
      const storage = yield* Storage;
      const deleted = yield* Effect.flatMap(storage.deleteIdentity(name), (result) => deletedOrRefused(name, result));
      yield* avatarBytesRemoved;
      const identity = yield* announcedDeleted(deleted);
      return yield* HttpServerResponse.schemaJson(IdentityResponseSchema)({ identity });
    }),
  method: "DELETE",
  path: identityPath,
};

const messageCountRoute: Route<Caller | Storage> = {
  handle: (params) =>
    Effect.gen(function* identityMessageCountRoute() {
      const name = yield* nameParam(params);
      const storage = yield* Storage;
      const found = yield* storage.findIdentityByName(name);
      if (Predicate.isUndefined(found)) {
        return yield* Effect.fail(identityNotFound(name));
      }
      const messages = yield* storage.countMessagesBy(name);
      return yield* HttpServerResponse.schemaJson(IdentityMessageCountResponseSchema)({ messages });
    }),
  method: "GET",
  path: identityMessageCountPath,
};

export const deletionRoutes: readonly Route<Caller | Storage | AssetStore | IdentityChanges>[] = [
  deleteRoute,
  messageCountRoute,
];

import { AssetStore, Storage } from "../../../storage/server.ts";
import { Effect, Option, Predicate } from "effect";
import type { Identity, IdentityName } from "../../index.ts";
import {
  avatarLimits,
  avatarNotPngRefusal,
  avatarPartName,
  avatarTooLargeRefusal,
  avatarWrongSizeRefusal,
  isAvatarId,
} from "../../../avatars/index.ts";
import type { AvatarId } from "../../../avatars/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { Secrets } from "../../../secrets/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { detectImage } from "../../../attachments/server.ts";
import { identityNotFound } from "./routes.ts";
import { ownsAgent } from "./auth.ts";

type StepNeeds = Storage | AssetStore | Secrets;

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_LARGE = 413;

const tooLarge: Refusal = { ...avatarTooLargeRefusal, status: TOO_LARGE };
const notPng: Refusal = { ...avatarNotPngRefusal, status: BAD_REQUEST };
const wrongSize: Refusal = { ...avatarWrongSizeRefusal, status: BAD_REQUEST };

const avatarNotFound: Refusal = { code: "avatar_not_found", message: "No avatar has that ID.", status: NOT_FOUND };

const partMissing: Refusal = {
  code: "invalid_request",
  message: `Send the avatar as multipart/form-data with one \`${avatarPartName}\` file part.`,
  status: BAD_REQUEST,
};

function notOwner(name: IdentityName): Refusal {
  return {
    code: "not_owner",
    message: `Only ${name} itself or, for an agent, the human who owns it can set its avatar.`,
    status: FORBIDDEN,
  };
}

function settable({
  caller,
  name,
}: {
  readonly caller: Identity;
  readonly name: IdentityName;
}): Effect.Effect<Identity | undefined, Refusal | StorageUnavailable, Storage> {
  return Effect.gen(function* checkSettable() {
    const storage = yield* Storage;
    const target = yield* storage.findIdentityByName(name);
    if (Predicate.isNotUndefined(target) && caller.name !== target.name && !ownsAgent({ caller, target })) {
      return yield* Effect.fail(notOwner(name));
    }
    return target;
  });
}

function shapeRefusal(bytes: Uint8Array): Option.Option<Refusal> {
  return Option.match(
    Option.filter(detectImage(bytes), (image) => image.contentType === "image/png"),
    {
      onNone: () => Option.some(notPng),
      onSome: ({ height, width }) => {
        if (Predicate.isUndefined(width) || Predicate.isUndefined(height)) {
          return Option.some(notPng);
        }
        if (width !== avatarLimits.side || height !== avatarLimits.side) {
          return Option.some(wrongSize);
        }
        return Option.none();
      },
    },
  );
}

function checkedShape(bytes: Uint8Array): Effect.Effect<Uint8Array, Refusal> {
  return Option.match(shapeRefusal(bytes), { onNone: () => Effect.succeed(bytes), onSome: Effect.fail });
}

function inUse(requested: string): Effect.Effect<AvatarId, Refusal | StorageUnavailable, Storage> {
  return Effect.gen(function* findAvatar() {
    if (!isAvatarId(requested)) {
      return yield* Effect.fail(avatarNotFound);
    }
    const storage = yield* Storage;
    const used = yield* storage.avatarInUse(requested);
    if (!used) {
      return yield* Effect.fail(avatarNotFound);
    }
    return requested;
  });
}

function isSet<Result extends { readonly status: string }>(
  result: Result,
): result is Extract<Result, { readonly status: "set" }> {
  return result.status === "set";
}

function replacedIds(result: { readonly replaced?: AvatarId }): readonly AvatarId[] {
  return Option.toArray(Option.fromNullishOr(result.replaced));
}

interface Setting {
  readonly name: IdentityName;
  readonly bytes: Uint8Array;
}

function stored({
  bytes,
  name,
}: Setting): Effect.Effect<Identity, Refusal | StorageUnavailable, AssetStore | Storage | Secrets> {
  return Effect.gen(function* storeAvatar() {
    const assets = yield* AssetStore;
    const storage = yield* Storage;
    const id = yield* Effect.flatMap(Secrets, (secrets) => secrets.newAvatarId);
    yield* assets.put(id, bytes);
    const result = yield* storage.setAvatar(name, id).pipe(
      Effect.filterOrFail(isSet, () => identityNotFound(name)),
      Effect.onError(() => Effect.ignore(assets.remove([id]))),
    );
    yield* Effect.ignore(assets.remove(replacedIds(result)));
    return result.identity;
  });
}

export { checkedShape, inUse, partMissing, settable, stored, tooLarge };
export type { StepNeeds };

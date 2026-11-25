import { Caller, announced } from "./auth.ts";
import { Effect, Option, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse, Multipart } from "effect/http";
import { avatarLimits, avatarPartName, avatarPath, identityAvatarPath } from "../../../avatars/index.ts";
import { checkedShape, inUse, partMissing, settable, stored, tooLarge } from "./avatar-steps.ts";
import { AssetStore } from "../../../storage/server.ts";
import type { IdentityChanges } from "./auth.ts";
import { IdentityResponseSchema } from "./wire.ts";
import type { Route } from "../../../http/server.ts";
import type { StepNeeds } from "./avatar-steps.ts";
import type { Storage } from "../../../storage/server.ts";
import { nameParam } from "./routes.ts";
import { servingHeaders } from "../../../attachments/server.ts";

const MEBIBYTE = 1_048_576;

const identityResponse = HttpServerResponse.schemaJson(IdentityResponseSchema);

const multipartLimits = Multipart.limitsServices({
  fieldMimeTypes: [],
  maxFieldSize: MEBIBYTE,
  maxFileSize: avatarLimits.maximumBytes,
  maxTotalSize: avatarLimits.maximumBytes + MEBIBYTE,
});

function withPart(
  found: Option.Option<Uint8Array>,
  part: Multipart.Part,
): Effect.Effect<Option.Option<Uint8Array>, Multipart.MultipartError> {
  if (Option.isSome(found) || part.key !== avatarPartName || !Multipart.isFile(part)) {
    return Effect.succeed(found);
  }
  return Effect.asSome(part.contentEffect);
}

function refusedTooLarge(): Effect.Effect<never, typeof tooLarge> {
  return Effect.fail(tooLarge);
}

const sentAvatar = Effect.gen(function* readAvatarPart() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const found = yield* request.multipartStream.pipe(
    Stream.runFoldEffect(() => Option.none<Uint8Array>(), withPart),
    Effect.catchReasons("MultipartError", { BodyTooLarge: refusedTooLarge, FileTooLarge: refusedTooLarge }, () =>
      Effect.fail(partMissing),
    ),
    Effect.provideContext(multipartLimits),
  );
  const bytes = yield* Effect.fromOption(found).pipe(Effect.mapError(() => partMissing));
  return yield* checkedShape(bytes);
});

const setRoute: Route<Caller | StepNeeds | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* setAvatarRoute() {
      const caller = yield* Caller;
      const name = yield* nameParam(params);
      yield* settable({ caller, name });
      const bytes = yield* sentAvatar;
      const identity = yield* Effect.flatMap(stored({ bytes, name }), announced);
      return yield* identityResponse({ identity });
    }),
  method: "PUT",
  path: identityAvatarPath,
};

const serveRoute: Route<Storage | AssetStore> = {
  handle: (params) =>
    Effect.gen(function* serveAvatar() {
      const id = yield* inUse(String(params["id"]));
      const assets = yield* AssetStore;
      return HttpServerResponse.stream(assets.read(id), {
        contentType: "image/png",
        headers: { ...servingHeaders, "content-disposition": "inline" },
      });
    }),
  method: "GET",
  path: avatarPath,
};

const avatarRoutes: readonly Route<Caller | StepNeeds | IdentityChanges>[] = [setRoute, serveRoute];

export { avatarRoutes };

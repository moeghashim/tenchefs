import { Effect, Option } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { AvatarId } from "../../../avatars/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import type { TestCookoutService } from "../../../testing/server.ts";
import { avatarPng } from "../../../testing/index.ts";
import { request } from "../../../http/client.ts";

const NOT_FOUND = 404;
const AVATAR = "/v1/avatars/:id";

function avatarOf(identity: { readonly avatar?: { readonly id: AvatarId } }): AvatarId {
  return Option.getOrThrow(Option.fromNullishOr(identity.avatar)).id;
}

function asked(cookout: TestCookoutService, id: AvatarId): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({
      baseUrl: cookout.url,
      headers: { authorization: `Bearer ${cookout.adminToken}` },
      method: "GET",
      params: { id },
      path: AVATAR,
    }),
  );
}

function withAvatar(cookout: TestCookoutService, name: string): Effect.Effect<AvatarId> {
  return Effect.gen(function* setOwnAvatar() {
    const who = yield* cookout.createIdentity(name, { kind: "human" });
    const { identity } = yield* answer(() => who.client.setAvatar(name, avatarPng()));
    return avatarOf(identity);
  });
}

it.effect("deleting an identity deletes its avatar: its ID gives 404 and the store holds no bytes for it", () =>
  Effect.gen(function* deletedWithAvatar() {
    const cookout = yield* TestCookout;
    const id = yield* withAvatar(cookout, "ada");
    const kept = yield* withAvatar(cookout, "bo");
    yield* answer(() => cookout.client.deleteIdentity("ada"));
    const gone = yield* asked(cookout, id);
    const held = yield* cookout.heldAssets([id, kept]);

    expect(gone).toMatchObject({ json: { error: { code: "avatar_not_found" } }, status: NOT_FOUND });
    expect(held).toStrictEqual([kept]);
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("avatar bytes a failed removal left behind are logged, and the next identity delete removes them", () =>
  Effect.gen(function* leftBehind() {
    const cookout = yield* TestCookout;
    const id = yield* withAvatar(cookout, "ada");
    const deleted = yield* answer(() => cookout.client.deleteIdentity("ada"));
    const leftOver = yield* cookout.heldAssets([id]);
    yield* Effect.andThen(
      cookout.createIdentity("bo", { kind: "human" }),
      answer(() => cookout.client.deleteIdentity("bo")),
    );
    const [afterNext, logs] = yield* Effect.all([cookout.heldAssets([id]), cookout.logs], { concurrency: 1 });

    expect(deleted).toMatchObject({ identity: { name: "ada" } });
    expect(leftOver).toStrictEqual([id]);
    expect(afterNext).toStrictEqual([]);
    expect(logs).toContainEqual({
      level: "ERROR",
      message: `The bytes of 1 avatars of deleted identities couldn't be removed from the asset store (${id}): The test made this asset store fail to remove once.`,
    });
  }).pipe(Effect.provide(testCookout({ assets: "first-remove-fails", storage: "sqlite" }))),
);

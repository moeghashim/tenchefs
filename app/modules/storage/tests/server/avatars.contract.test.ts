import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { HumanIdentity, Identity } from "../../../identities/index.ts";
import { expect, it } from "@effect/vitest";
import { fixtureTime, identityName as nameOf, openStore, storageLayers } from "../../../testing/server.ts";
import type { AvatarId } from "../../../avatars/index.ts";
import { isAvatarId } from "../../../avatars/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const TEN = 10;

function avatarId(raw: string): AvatarId {
  return Option.getOrThrow(Option.liftPredicate(raw, isAvatarId));
}

function human(name: string): HumanIdentity {
  return { admin: false, createdAt: fixtureTime, kind: "human", name: nameOf(name) };
}

function named(identities: readonly Identity[], name: string): Identity | undefined {
  return Option.getOrUndefined(Arr.findFirst(identities, (found) => found.name === name));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity keeps the avatar set last, and says which one it replaced",
  ({ layer }) =>
    Effect.gen(function* keepAvatar() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(human("ada"), hashA);
      const first = yield* storage.setAvatar(nameOf("ada"), avatarId("first"));
      const second = yield* storage.setAvatar(nameOf("ada"), avatarId("second"));
      const found = yield* storage.findIdentityByName(nameOf("ada"));
      const listed = yield* storage.listIdentities();
      const withSecond = { ...human("ada"), avatar: { id: "second" } };

      expect([first, second]).toStrictEqual([
        { identity: { ...human("ada"), avatar: { id: "first" } }, status: "set" },
        { identity: withSecond, replaced: "first", status: "set" },
      ]);
      expect([found, named(listed, "ada")]).toStrictEqual([withSecond, withSecond]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent takes an avatar, only worn avatars are in use, and a missing name is not_found",
  ({ layer }) =>
    Effect.gen(function* inUseAvatars() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(human("ada"), hashA);
      yield* storage.createIdentity({ ...human("bot"), kind: "agent", owner: nameOf("ada") }, hashB);
      yield* storage.setAvatar(nameOf("ada"), avatarId("first"));
      yield* storage.setAvatar(nameOf("ada"), avatarId("second"));
      const agent = yield* storage.setAvatar(nameOf("bot"), avatarId("bots"));
      const held = yield* Effect.forEach(["first", "second", "bots"], (raw) => storage.avatarInUse(avatarId(raw)), {
        concurrency: 1,
      });
      const missing = yield* storage.setAvatar(nameOf("nobody"), avatarId("third"));

      expect(agent).toMatchObject({ identity: { avatar: { id: "bots" }, kind: "agent" }, status: "set" });
      expect([held, missing]).toStrictEqual([[false, true, true], { status: "not_found" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting an identity keeps its avatar to remove until its bytes are said to be removed",
  ({ layer }) =>
    Effect.gen(function* avatarsToRemove() {
      const { storage } = yield* openStore(layer);
      yield* Effect.all(
        [
          storage.createIdentity(human("ada"), hashA),
          storage.createIdentity(human("bo"), hashB),
          storage.setAvatar(nameOf("ada"), avatarId("ada-avatar")),
          storage.setAvatar(nameOf("bo"), avatarId("bo-avatar")),
        ],
        { concurrency: 1 },
      );
      const before = yield* storage.avatarsToRemove(TEN);
      yield* Effect.all([storage.deleteIdentity(nameOf("ada")), storage.deleteIdentity(nameOf("bo"))], {
        concurrency: 1,
      });
      const deleted = yield* storage.avatarsToRemove(TEN);
      yield* storage.avatarsRemoved([avatarId("ada-avatar")]);
      const after = yield* storage.avatarsToRemove(TEN);

      expect([before, deleted, after]).toStrictEqual([[], ["ada-avatar", "bo-avatar"], ["bo-avatar"]]);
    }),
);

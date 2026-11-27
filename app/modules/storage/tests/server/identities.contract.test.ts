import { Array as Arr, Effect, String as Str, pipe } from "effect";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const AT_ONCE = 10;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const hashC = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const unavailable = { _tag: "StorageUnavailable" };
const matt = identity("matt", { kind: "human" });

it.effect.each(storageLayers)("storage contract ($adapter): a new store has no identities", ({ emptyLayer }) =>
  Effect.gen(function* newStore() {
    const { storage } = yield* openStore(emptyLayer);
    const identities = yield* storage.listIdentities();

    expect(identities).toStrictEqual([]);
  }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity is found by name as stored, and a missing name finds nothing",
  ({ layer }) =>
    Effect.gen(function* findByName() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("zed", { owner: "matt" }), hashA);
      const found = yield* storage.findIdentityByName(nameOf("zed"));
      const missing = yield* storage.findIdentityByName(nameOf("nobody"));

      expect(found).toStrictEqual(identity("zed", { owner: "matt" }));
      expect(missing).toBeUndefined();
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): identities are created and listed by name", ({ layer }) =>
  Effect.gen(function* createAndList() {
    const { storage } = yield* openStore(layer);
    const agent = yield* storage.createIdentity(identity("zed", { owner: "matt" }), hashA);
    const human = yield* storage.createIdentity(identity("auth-griller", { kind: "human" }), hashB);
    const identities = yield* storage.listIdentities();

    expect([agent, human]).toStrictEqual(["created", "created"]);
    expect(identities).toStrictEqual([identity("auth-griller", { kind: "human" }), matt, identity("zed")]);
  }),
);

it.effect.each(storageLayers)("storage contract ($adapter): the admin flag is kept", ({ layer }) =>
  Effect.gen(function* adminFlag() {
    const { storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("boss", { admin: true }), hashA);
    const identities = yield* storage.listIdentities();

    expect(identities).toStrictEqual([identity("boss", { admin: true }), matt]);
  }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity's kind is kept when it is listed, found by token and rotated",
  ({ layer }) =>
    Effect.gen(function* kindKept() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.createIdentity(identity("bot", { kind: "agent", owner: "ada" }), hashB);
      const identities = yield* storage.listIdentities();
      const found = yield* storage.findIdentityByTokenHash(hashA);
      const rotated = yield* storage.replaceToken(nameOf("bot"), hashC);

      expect(Arr.map(identities, ({ kind, name }) => [name, kind])).toStrictEqual([
        ["ada", "human"],
        ["bot", "agent"],
        ["matt", "human"],
      ]);
      expect(found).toStrictEqual({ identity: identity("ada", { kind: "human" }), status: "active" });
      expect(rotated).toStrictEqual({ identity: identity("bot", { owner: "ada" }), status: "replaced" });
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a name can be used only once", ({ layer }) =>
  Effect.gen(function* nameOnce() {
    const { storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("dup", { owner: "matt" }), hashA);
    const second = yield* storage.createIdentity(identity("dup"), hashB);
    const identities = yield* storage.listIdentities();
    const secondHash = yield* storage.findIdentityByTokenHash(hashB);

    expect(second).toBe("name_taken");
    expect(identities).toStrictEqual([identity("dup", { owner: "matt" }), matt]);
    expect(secondHash).toStrictEqual({ status: "unknown" });
  }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a token hash finds its identity", ({ layer }) =>
  Effect.gen(function* hashFindsIdentity() {
    const { storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("one", { owner: "matt" }), hashA);
    yield* storage.createIdentity(identity("two"), hashB);
    const one = yield* storage.findIdentityByTokenHash(hashA);
    const two = yield* storage.findIdentityByTokenHash(hashB);

    expect(one).toStrictEqual({ identity: identity("one", { owner: "matt" }), status: "active" });
    expect(two).toStrictEqual({ identity: identity("two"), status: "active" });
  }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a token hash that was never stored is unknown",
  ({ layer }) =>
    Effect.gen(function* unknownHash() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("one"), hashA);
      const found = yield* storage.findIdentityByTokenHash(hashC);

      expect(found).toStrictEqual({ status: "unknown" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): replacing a token revokes the old hash at once",
  ({ layer }) =>
    Effect.gen(function* replaceToken() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("one"), hashA);
      const replaced = yield* storage.replaceToken(nameOf("one"), hashB);
      const oldHash = yield* storage.findIdentityByTokenHash(hashA);
      const newHash = yield* storage.findIdentityByTokenHash(hashB);

      expect(replaced).toStrictEqual({ identity: identity("one"), status: "replaced" });
      expect(oldHash).toStrictEqual({ status: "revoked" });
      expect(newHash).toStrictEqual({ identity: identity("one"), status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): replacing the token of a missing identity changes nothing",
  ({ layer }) =>
    Effect.gen(function* replaceMissing() {
      const { storage } = yield* openStore(layer);
      const replaced = yield* storage.replaceToken(nameOf("nobody"), hashA);
      const found = yield* storage.findIdentityByTokenHash(hashA);

      expect(replaced).toStrictEqual({ status: "not_found" });
      expect(found).toStrictEqual({ status: "unknown" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): setting the only token of a missing identity creates it with that token",
  ({ layer }) =>
    Effect.gen(function* setOnlyTokenCreates() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("other"), hashB);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashA);
      const identities = yield* storage.listIdentities();
      const found = yield* storage.findIdentityByTokenHash(hashA);

      expect(identities).toStrictEqual([identity("admin", { admin: true }), matt, identity("other")]);
      expect(found).toStrictEqual({ identity: identity("admin", { admin: true }), status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): setting a different only token revokes every other token of the identity",
  ({ layer }) =>
    Effect.gen(function* setOnlyTokenReplaces() {
      const { storage } = yield* openStore(layer);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashA);
      yield* storage.replaceToken(nameOf("admin"), hashB);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashA);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashC);
      const lookups = yield* Effect.forEach([hashA, hashB, hashC], storage.findIdentityByTokenHash, { concurrency: 1 });

      expect(lookups).toStrictEqual([
        { status: "revoked" },
        { status: "revoked" },
        { identity: identity("admin", { admin: true }), status: "active" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): setting the only token an identity already holds changes nothing",
  ({ layer }) =>
    Effect.gen(function* setOnlyTokenUnchanged() {
      const { storage } = yield* openStore(layer);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashA);
      yield* storage.setOnlyToken(identity("admin", { admin: true }), hashA);
      const identities = yield* storage.listIdentities();
      const found = yield* storage.findIdentityByTokenHash(hashA);

      expect(identities).toStrictEqual([identity("admin", { admin: true }), matt]);
      expect(found).toStrictEqual({ identity: identity("admin", { admin: true }), status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): only one identity is created when its only token is set many times at once",
  ({ layer }) =>
    Effect.gen(function* setOnlyTokenAtOnce() {
      const { storage } = yield* openStore(layer);
      yield* pipe(
        Arr.makeBy(AT_ONCE, String),
        Effect.forEach(
          (index) =>
            storage.setOnlyToken(identity("admin", { admin: true }), tokenHash(Str.repeat(HASH_LENGTH)(index))),
          { concurrency: "unbounded", discard: true },
        ),
      );
      const identities = yield* storage.listIdentities();

      expect(identities).toStrictEqual([identity("admin", { admin: true }), matt]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the admin setting is applied once, and a token rotated since is kept until it changes",
  ({ layer }) =>
    Effect.gen(function* adminSettingAppliedOnce() {
      const { storage } = yield* openStore(layer);
      const admin = identity("admin", { admin: true });
      const first = yield* storage.applyAdminSetting(admin, hashA);
      yield* storage.replaceToken(nameOf("admin"), hashB);
      const again = yield* storage.applyAdminSetting(admin, hashA);
      const kept = yield* storage.findIdentityByTokenHash(hashB);
      const changed = yield* storage.applyAdminSetting(admin, hashC);
      const lookups = yield* Effect.forEach([hashA, hashB, hashC], storage.findIdentityByTokenHash, { concurrency: 1 });

      expect([first, again, kept, changed]).toStrictEqual([
        "applied",
        "unchanged",
        { identity: admin, status: "active" },
        "applied",
      ]);
      expect(lookups).toStrictEqual([
        { status: "revoked" },
        { status: "revoked" },
        { identity: admin, status: "active" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an admin setting changed back to an earlier one is applied again",
  ({ layer }) =>
    Effect.gen(function* adminSettingChangedBack() {
      const { storage } = yield* openStore(layer);
      const admin = identity("admin", { admin: true });
      yield* storage.applyAdminSetting(admin, hashA);
      yield* storage.applyAdminSetting(admin, hashB);
      const back = yield* storage.applyAdminSetting(admin, hashA);
      const lookups = yield* Effect.forEach([hashA, hashB], storage.findIdentityByTokenHash, { concurrency: 1 });

      expect(back).toBe("applied");
      expect(lookups).toStrictEqual([{ identity: admin, status: "active" }, { status: "revoked" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): with no admin setting recorded, a setting whose token the identity held counts as applied",
  ({ layer }) =>
    Effect.gen(function* adminSettingBeforeRecord() {
      const { storage } = yield* openStore(layer);
      const admin = identity("admin", { admin: true });
      yield* storage.setOnlyToken(admin, hashA);
      yield* storage.replaceToken(nameOf("admin"), hashB);
      const unrecorded = yield* storage.applyAdminSetting(admin, hashA);
      const kept = yield* storage.findIdentityByTokenHash(hashB);
      const renamed = yield* storage.applyAdminSetting(identity("boss", { admin: true }), hashA);

      expect([unrecorded, renamed]).toStrictEqual(["unchanged", "applied"]);
      expect(kept).toStrictEqual({ identity: admin, status: "active" });
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): identities cannot be used in a closed store", ({ layer }) =>
  Effect.gen(function* closedStore() {
    const { close, storage } = yield* openStore(layer);
    yield* close;
    const listed = yield* Effect.flip(storage.listIdentities());
    const created = yield* Effect.flip(storage.createIdentity(identity("late"), hashA));
    const found = yield* Effect.flip(storage.findIdentityByTokenHash(hashA));

    expect([listed, created, found]).toMatchObject([unavailable, unavailable, unavailable]);
  }),
);

import { Array as Arr, Effect, Option, Order } from "effect";
import type { EndedCredential, Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const made = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:14:59.999Z");
const expiresAt = isoTime("2026-01-01T00:15:00.000Z");
const ada = identity("ada", { kind: "human" });
const matt = identity("matt", { admin: true, kind: "human" });
const adminSession = tokenHash("hash:matt-session");
const linkHash = tokenHash("hash:link");
const redeemed = tokenHash("hash:redeemed");

type Store = Storage["Service"];

const BY_HASH = Order.mapInput(Order.String, ({ hash }: { readonly hash: TokenHash }) => hash);

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const link = { createdAt: made, expiresAt, identity: ada.name, linkHash, parent: adminSession };

interface Redeem {
  readonly credentialHash: TokenHash;
  readonly host: string;
  readonly linkHash: TokenHash;
  readonly now: IsoTime;
}

type Revoked = Effect.Success<ReturnType<Store["revokeSession"]>>;

function endedBy(revoked: Revoked): readonly EndedCredential[] {
  if (revoked.status === "revoked") {
    return Arr.sort(revoked.ended, BY_HASH);
  }
  return [];
}

function redeemOf(credentialHash: TokenHash, now: IsoTime = before): Redeem {
  return { credentialHash, host: "Firefox on macOS", linkHash, now };
}

function withLink(storage: Store): Fails<void> {
  return Effect.gen(function* adminMakesLink() {
    yield* storage.createIdentity(matt, tokenHash("hash:matt"));
    yield* storage.createIdentity(ada, tokenHash("hash:ada"));
    yield* storage.issueLoginCredential({
      credentialHash: adminSession,
      host: "Safari on macOS",
      identity: matt.name,
      now: made,
      parent: tokenHash("hash:matt"),
    });
    yield* storage.addLoginLink(link);
  });
}

function sessionIdOf(storage: Store, hash: TokenHash): Fails<PublicId> {
  return Effect.map(storage.listSessions({ current: hash, identity: matt.name, now: before }), (sessions) =>
    Option.match(
      Arr.findFirst(sessions, ({ current }) => current),
      { onNone: () => expect.unreachable("The admin's session is not listed."), onSome: ({ id }) => id },
    ),
  );
}

function isActive(storage: Store, hash: TokenHash): Fails<boolean> {
  return Effect.map(storage.checkLoginCredential({ hash, now: before }), ({ status }) => status === "active");
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login link redeems once into a web session for its person",
  ({ layer }) =>
    Effect.gen(function* redeemOnce() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      const first = yield* storage.redeemLoginLink(redeemOf(redeemed));
      const second = yield* storage.redeemLoginLink(redeemOf(tokenHash("hash:second")));
      const used = yield* storage.checkLoginCredential({ hash: redeemed, now: before });
      const sessions = yield* storage.listSessions({ current: redeemed, identity: ada.name, now: before });

      expect(first).toMatchObject({ identity: { name: ada.name }, status: "redeemed" });
      expect(second).toStrictEqual({ status: "gone" });
      expect(used).toMatchObject({ identity: { name: ada.name }, status: "active" });
      expect(sessions).toMatchObject([{ current: true, kind: "web", madeAt: before, where: "Firefox on macOS" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login link at its 15 minutes, or never made, finds nothing",
  ({ layer }) =>
    Effect.gen(function* goneLinks() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      const unknown = yield* storage.redeemLoginLink({ ...redeemOf(redeemed), linkHash: tokenHash("hash:unknown") });
      const expired = yield* storage.redeemLoginLink(redeemOf(redeemed, expiresAt));
      const active = yield* isActive(storage, redeemed);

      expect([unknown, expired]).toStrictEqual([{ status: "gone" }, { status: "gone" }]);
      expect(active).toBe(false);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login link for a person deactivated or deleted since finds nothing",
  ({ layer }) =>
    Effect.gen(function* linksOfGonePeople() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      yield* storage.deactivateIdentity(ada.name);
      const deactivated = yield* storage.redeemLoginLink(redeemOf(redeemed));
      yield* storage.reactivateIdentity(ada.name, tokenHash("hash:ada-again"));
      yield* storage.addLoginLink({ ...link, linkHash: tokenHash("hash:for-deleted") });
      yield* storage.deleteIdentity(ada.name);
      const deleted = yield* storage.redeemLoginLink({
        ...redeemOf(redeemed),
        linkHash: tokenHash("hash:for-deleted"),
      });

      expect([deactivated, deleted]).toStrictEqual([{ status: "gone" }, { status: "gone" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking the admin's session that made a link ends the session redeemed from it",
  ({ layer }) =>
    Effect.gen(function* revokeThroughLink() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      yield* storage.redeemLoginLink(redeemOf(redeemed));
      const id = yield* sessionIdOf(storage, adminSession);
      const revoked = yield* storage.revokeSession({ id, identity: matt.name, now: before });
      const active = yield* isActive(storage, redeemed);

      expect(endedBy(revoked)).toStrictEqual([
        { hash: adminSession, identity: matt.name, kind: "session" },
        { hash: redeemed, identity: ada.name, kind: "session" },
      ]);
      expect(active).toBe(false);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking the admin's session that made a link ends the link unredeemed",
  ({ layer }) =>
    Effect.gen(function* revokeUnredeemedLink() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      const id = yield* sessionIdOf(storage, adminSession);
      const revoked = yield* storage.revokeSession({ id, identity: matt.name, now: before });
      const afterwards = yield* storage.redeemLoginLink(redeemOf(redeemed));

      expect(endedBy(revoked)).toContainEqual({
        hash: linkHash,
        identity: ada.name,
        kind: "login link",
      });
      expect(afterwards).toStrictEqual({ status: "gone" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating a person ends the login links made for them",
  ({ layer }) =>
    Effect.gen(function* deactivationEndsLinks() {
      const { storage } = yield* openStore(layer);
      yield* withLink(storage);
      const ended = yield* storage.endCredentialsOf(ada.name, before);

      expect(ended).toContainEqual({ hash: linkHash, identity: ada.name, kind: "login link" });
    }),
);

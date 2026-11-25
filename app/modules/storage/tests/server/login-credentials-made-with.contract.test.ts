import { Array as Arr, Effect, Order } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const before = isoTime("2026-01-01T00:05:00.000Z");
const ada = identity("ada", { kind: "human" });
const adaToken = tokenHash("hash:ada");
const credentialHash = tokenHash("hash:credential");
const requestHash = tokenHash("hash:request");
const request = {
  createdAt: isoTime("2026-01-01T00:00:00.000Z"),
  expiresAt: isoTime("2026-01-01T00:10:00.000Z"),
  host: "ada-laptop",
  requestHash,
  userCode: "WDJB-MJHT",
};

type Store = Storage["Service"];

function isFound(found: unknown): boolean {
  return found !== null && typeof found === "object";
}

function withAdaLoggedIn(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* adaAndHerLogin() {
    yield* storage.createIdentity(ada, adaToken);
    yield* storage.addLoginRequest(request, request.createdAt);
    yield* storage.approveLoginRequest(request.userCode, ada.name, before);
    yield* storage.collectLoginRequest({ credentialHash, now: before, requestHash });
  });
}

const [web, fromWeb, fromLogin] = [tokenHash("hash:web"), tokenHash("hash:from-web"), tokenHash("hash:from-login")];

function issuedWith(
  storage: Store,
  hashes: readonly [TokenHash, TokenHash],
): Effect.Effect<unknown, StorageUnavailable> {
  const [issued, madeWith] = hashes;
  return storage.issueLoginCredential({
    credentialHash: issued,
    host: "web",
    identity: ada.name,
    madeWith,
    now: before,
  });
}

function webSessionsAndALogin(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* issueSessions() {
    yield* withAdaLoggedIn(storage);
    yield* issuedWith(storage, [web, adaToken]);
    yield* issuedWith(storage, [fromWeb, web]);
    yield* issuedWith(storage, [fromLogin, credentialHash]);
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): once a token is replaced, the Login credentials made with it are revoked, and only those",
  ({ layer }) =>
    Effect.gen(function* madeWithRevoked() {
      const { storage } = yield* openStore(layer);
      yield* webSessionsAndALogin(storage);
      const beforeRotation = yield* storage.revokeLoginCredentialsMadeWithRevokedTokens(ada.name);
      yield* storage.replaceToken(ada.name, tokenHash("hash:ada-rotated"));
      const revoked = yield* storage.revokeLoginCredentialsMadeWithRevokedTokens(ada.name);
      const again = yield* storage.revokeLoginCredentialsMadeWithRevokedTokens(ada.name);
      const found = yield* Effect.forEach([web, fromWeb, fromLogin, credentialHash], storage.findLoginCredential, {
        concurrency: 1,
      });

      expect([beforeRotation, Arr.sort(revoked, Order.String), again]).toStrictEqual([[], [fromWeb, web], []]);
      expect(Arr.map(found, isFound)).toStrictEqual([false, false, true, true]);
    }),
);

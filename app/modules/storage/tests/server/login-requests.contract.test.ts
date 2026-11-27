import type { LoginCollection, Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  identityName,
  isoTime,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { Effect } from "effect";
import type { TokenHash } from "../../../identities/index.ts";
import { UNKNOWN_ID } from "./lineage-seeds.ts";
import { tokenHash } from "../../../identities/index.ts";

const created = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2026-01-01T00:10:00.000Z");
const after = isoTime("2026-01-01T00:10:00.001Z");
const requestHash = tokenHash("hash:request");
const credentialHash = tokenHash("hash:credential");
const ada = identity("ada", { kind: "human" });
const FAILING_CALLS = 11;
const late = tokenHash("hash:late");
const adaToken = tokenHash("hash:ada");

const request = { createdAt: created, expiresAt, host: "ada-laptop", requestHash, userCode: "WDJB-MJHT" };

type Store = Storage["Service"];

function withAda(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.asVoid(storage.createIdentity(ada, adaToken));
}

function approvedAndCollected(
  storage: Store,
  userCode: string,
  hashes: readonly [TokenHash, TokenHash],
): Effect.Effect<LoginCollection, StorageUnavailable> {
  const [requested, credential] = hashes;
  return Effect.gen(function* approveAndCollect() {
    yield* storage.addLoginRequest({ ...request, requestHash: requested, userCode }, created);
    yield* storage.approveLoginRequest({ approver: ada.name, now: before, userCode });
    return yield* storage.collectLoginRequest({ credentialHash: credential, now: before, requestHash: requested });
  });
}

function isFound(found: unknown): boolean {
  return found !== null && typeof found === "object";
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login request is found by its user code, pending until approved",
  ({ layer }) =>
    Effect.gen(function* pendingThenApproved() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      const added = yield* storage.addLoginRequest(request, created);
      const found = yield* storage.findLoginRequest("WDJB-MJHT", before);
      const pending = yield* storage.collectLoginRequest({ credentialHash, now: before, requestHash });
      const approved = yield* storage.approveLoginRequest({ approver: ada.name, now: before, userCode: "WDJB-MJHT" });
      const shown = yield* storage.findLoginRequest("WDJB-MJHT", before);

      expect([added, found, pending, approved, shown]).toStrictEqual([
        "added",
        { approved: false, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
        { status: "pending" },
        "approved",
        { approved: true, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an approved login request is collected once, issuing a Login credential",
  ({ layer }) =>
    Effect.gen(function* collectOnce() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      const first = yield* approvedAndCollected(storage, "WDJB-MJHT", [requestHash, credentialHash]);
      const again = tokenHash("hash:again");
      const second = yield* storage.collectLoginRequest({ credentialHash: again, now: before, requestHash });
      const gone = yield* storage.findLoginRequest("WDJB-MJHT", before);
      const credential = yield* storage.findLoginCredential(credentialHash);
      const notIssued = yield* storage.findLoginCredential(again);

      expect([first, second, credential]).toStrictEqual([
        { identity: ada, status: "collected" },
        { status: "gone" },
        ada,
      ]);
      expect([isFound(gone), isFound(notIssued)]).toStrictEqual([false, false]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login request past its expiry is gone, approved or not",
  ({ layer }) =>
    Effect.gen(function* expired() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      yield* storage.addLoginRequest(request, created);
      const found = yield* storage.findLoginRequest("WDJB-MJHT", after);
      const approved = yield* storage.approveLoginRequest({ approver: ada.name, now: after, userCode: "WDJB-MJHT" });
      const collected = yield* storage.collectLoginRequest({ credentialHash, now: after, requestHash });
      yield* storage.addLoginRequest({ ...request, requestHash: late, userCode: "LATE-CODE" }, created);
      yield* storage.approveLoginRequest({ approver: ada.name, now: before, userCode: "LATE-CODE" });
      const lateCollect = yield* storage.collectLoginRequest({ credentialHash, now: after, requestHash: late });

      expect([isFound(found), approved, collected, lateCollect]).toStrictEqual([
        false,
        "not_found",
        { status: "gone" },
        { status: "gone" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a user code held by a live request can't be reused, and an expired one can",
  ({ layer }) =>
    Effect.gen(function* codeTaken() {
      const { storage } = yield* openStore(layer);
      yield* storage.addLoginRequest(request, created);
      const other = { ...request, requestHash: tokenHash("hash:other") };
      const taken = yield* storage.addLoginRequest(other, before);
      const reused = yield* storage.addLoginRequest(other, after);

      expect([taken, reused]).toStrictEqual(["code_taken", "added"]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking one Login credential leaves the identity's others working",
  ({ layer }) =>
    Effect.gen(function* revoke() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      yield* approvedAndCollected(storage, "WDJB-MJHT", [requestHash, credentialHash]);
      const secondCredential = tokenHash("hash:second-credential");
      yield* approvedAndCollected(storage, "SECO-NDXX", [tokenHash("hash:second"), secondCredential]);
      const revoked = yield* storage.revokeLoginCredential(credentialHash, before);
      const again = yield* storage.revokeLoginCredential(credentialHash, before);
      const found = yield* storage.findLoginCredential(credentialHash);
      const kept = yield* storage.findLoginCredential(secondCredential);

      expect([revoked, again, isFound(found), kept]).toStrictEqual([true, false, false, ada]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Login credential issued straight to an identity authenticates as it until revoked",
  ({ layer }) =>
    Effect.gen(function* issuedStraight() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      const issued = yield* storage.issueLoginCredential({
        credentialHash,
        host: "web",
        identity: ada.name,
        now: before,
        parent: adaToken,
      });
      const found = yield* storage.findLoginCredential(credentialHash);
      const revoked = yield* storage.revokeLoginCredential(credentialHash, before);
      const gone = yield* storage.findLoginCredential(credentialHash);
      const nobody = yield* storage.issueLoginCredential({
        credentialHash: late,
        host: "web",
        identity: identityName("nobody"),
        now: before,
        parent: adaToken,
      });
      const notIssued = yield* storage.findLoginCredential(late);

      expect([issued, found, revoked]).toStrictEqual([ada, ada, true]);
      expect([isFound(gone), isFound(nobody), isFound(notIssued)]).toStrictEqual([false, false, false]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating an identity removes its Login credentials, even once reactivated",
  ({ layer }) =>
    Effect.gen(function* deleted() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      yield* approvedAndCollected(storage, "WDJB-MJHT", [requestHash, credentialHash]);
      yield* storage.deactivateIdentity(identityName("ada"));
      yield* storage.reactivateIdentity(identityName("ada"), tokenHash("hash:ada-again"));
      const found = yield* storage.findLoginCredential(credentialHash);

      expect(isFound(found)).toBe(false);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a request approved by an identity deactivated since is gone when collected",
  ({ layer }) =>
    Effect.gen(function* approverDeleted() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      yield* storage.addLoginRequest(request, created);
      yield* storage.approveLoginRequest({ approver: ada.name, now: before, userCode: "WDJB-MJHT" });
      yield* storage.deactivateIdentity(identityName("ada"));
      const collected = yield* storage.collectLoginRequest({ credentialHash, now: before, requestHash });
      const credential = yield* storage.findLoginCredential(credentialHash);

      expect([collected, isFound(credential)]).toStrictEqual([{ status: "gone" }, false]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login request approved twice at once is approved once, and collected once",
  ({ layer }) =>
    Effect.gen(function* approvedOnce() {
      const { storage } = yield* openStore(layer);
      yield* withAda(storage);
      yield* storage.createIdentity(identity("bob", { kind: "human" }), tokenHash("hash:bob"));
      yield* storage.addLoginRequest(request, created);
      const approvals = yield* Effect.all(
        [
          storage.approveLoginRequest({ approver: ada.name, now: before, userCode: "WDJB-MJHT" }),
          storage.approveLoginRequest({ approver: identityName("bob"), now: before, userCode: "WDJB-MJHT" }),
        ],
        { concurrency: "unbounded" },
      );
      const collections = yield* Effect.all(
        [
          storage.collectLoginRequest({ credentialHash, now: before, requestHash }),
          storage.collectLoginRequest({ credentialHash: late, now: before, requestHash }),
        ],
        { concurrency: "unbounded" },
      );
      const lateCredential = yield* storage.findLoginCredential(late);

      expect(approvals).toStrictEqual(["approved", "approved"]);
      expect(collections).toMatchObject([{ identity: { name: "ada" }, status: "collected" }, { status: "gone" }]);
      expect(lateCredential).toBeUndefined();
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a closed store can't keep login requests", ({ layer }) =>
  Effect.gen(function* closed() {
    const { close, storage } = yield* openStore(layer);
    yield* close;
    const failures = yield* Effect.all(
      [
        Effect.flip(storage.addLoginRequest(request, created)),
        Effect.flip(storage.findLoginRequest("WDJB-MJHT", before)),
        Effect.flip(storage.approveLoginRequest({ approver: ada.name, now: before, userCode: "WDJB-MJHT" })),
        Effect.flip(storage.collectLoginRequest({ credentialHash, now: before, requestHash })),
        Effect.flip(storage.findLoginCredential(credentialHash)),
        Effect.flip(storage.revokeLoginCredential(credentialHash, before)),
        Effect.flip(
          storage.issueLoginCredential({
            credentialHash,
            host: "web",
            identity: ada.name,
            now: before,
            parent: adaToken,
          }),
        ),
        Effect.flip(storage.revokeBelowRevokedTokens(ada.name, before)),
        Effect.flip(storage.endCredentialsOf(ada.name, before)),
        Effect.flip(storage.listSessions({ current: credentialHash, identity: ada.name, now: before })),
        Effect.flip(storage.revokeSession({ id: UNKNOWN_ID, identity: ada.name, now: before })),
      ],
      { concurrency: 1 },
    );

    expect(failures).toMatchObject(Array.from({ length: FAILING_CALLS }, () => ({ _tag: "StorageUnavailable" })));
  }),
);

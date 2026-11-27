import { Array as Arr, Effect, Order } from "effect";
import type { LoginCollection, LoginRequestKind, NewLoginRequest, Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const created = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2026-01-01T00:10:00.000Z");
const ada = identity("ada", { kind: "human" });

const cli: NewLoginRequest = {
  createdAt: created,
  expiresAt,
  host: "ada-laptop",
  requestHash: tokenHash("hash:cli-request"),
  userCode: "WDJB-MJHT",
};

const web: NewLoginRequest = {
  ...cli,
  host: "Firefox on macOS",
  kind: "web",
  requestHash: tokenHash("hash:web-request"),
  userCode: "WEBB-CODE",
};

type Store = Storage["Service"];

function bothApproved(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* addAndApprove() {
    yield* storage.createIdentity(ada, tokenHash("hash:ada"));
    for (const request of [web, cli]) {
      yield* storage.addLoginRequest(request, created);
      yield* storage.approveLoginRequest({ approver: ada.name, now: before, userCode: request.userCode });
    }
  });
}

interface Collect {
  readonly as: LoginRequestKind;
  readonly request: NewLoginRequest;
  readonly credential: string;
}

function collectedBy(
  storage: Store,
  collects: readonly Collect[],
): Effect.Effect<LoginCollection[], StorageUnavailable> {
  return Effect.forEach(
    collects,
    ({ as, credential, request }) =>
      storage.collectLoginRequest({
        credentialHash: tokenHash(credential),
        kind: as,
        now: before,
        requestHash: request.requestHash,
      }),
    { concurrency: 1 },
  );
}

function sessionsOfAda(storage: Store): Effect.Effect<string[], StorageUnavailable> {
  return Effect.map(
    storage.listSessions({ current: tokenHash("hash:no-session"), identity: ada.name, now: before }),
    (sessions) =>
      Arr.sort(
        Arr.map(sessions, ({ kind, where }) => `${kind}: ${where}`),
        Order.String,
      ),
  );
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a web login request collects only as web, a CLI one only as CLI, each making its kind of session",
  ({ layer }) =>
    Effect.gen(function* collectsAsItsKind() {
      const { storage } = yield* openStore(layer);
      yield* bothApproved(storage);
      const crossed = yield* collectedBy(storage, [
        { as: "cli", credential: "hash:late", request: web },
        { as: "web", credential: "hash:late", request: cli },
      ]);
      const own = yield* collectedBy(storage, [
        { as: "web", credential: "hash:web-credential", request: web },
        { as: "cli", credential: "hash:cli-credential", request: cli },
      ]);
      const sessions = yield* sessionsOfAda(storage);

      expect(crossed).toStrictEqual([{ status: "gone" }, { status: "gone" }]);
      expect(own).toStrictEqual([
        { identity: ada, status: "collected" },
        { identity: ada, status: "collected" },
      ]);
      expect(sessions).toStrictEqual(["cli: ada-laptop", "web: Firefox on macOS"]);
    }),
);

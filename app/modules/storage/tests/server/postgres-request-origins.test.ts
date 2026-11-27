import { Array as Arr, Effect, Option, Order } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import {
  emptyPostgresDatabase,
  identityFixture,
  isoTime,
  onPostgresDatabase,
  openStore,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { PublicId } from "../../../logins/index.ts";
import type { Redacted } from "effect";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const ada = identityFixture("ada", { kind: "human" });
const triage = identityFixture("triage-agent", { kind: "agent", owner: "ada" });
const created = isoTime("2026-01-01T00:00:00.000Z");
const expiresAt = isoTime("2999-01-01T00:00:00.000Z");
const BEFORE_REQUEST_ORIGINS = [
  "DROP TABLE login_links",
  "ALTER TABLE login_requests DROP COLUMN kind",
  "DROP TABLE credential_lineage",
  "ALTER TABLE login_requests DROP COLUMN approved_with",
  "ALTER TABLE agent_join_requests DROP COLUMN approved_with",
  "ALTER TABLE login_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "ALTER TABLE agent_join_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "UPDATE schema_version SET version = version - 4",
];

const login = { createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" };
const join = { agent: triage.name, createdAt: created, expiresAt, host: "build-box", userCode: "JOIN-CODE" };

function opened(url: Redacted.Redacted): ReturnType<typeof openStore<StorageUnavailable, never>> {
  return openStore(postgresStorage({ cipher: testSecretsCipher, url }));
}

const requestsStoredBeforeOrigins = Effect.gen(function* storeRequestsBeforeOrigins() {
  const url = yield* emptyPostgresDatabase;
  const { close, storage } = yield* opened(url);
  yield* storage.createIdentity(ada, tokenHash("hash:ada"));
  yield* storage.createIdentity(triage, tokenHash("hash:triage"));
  yield* storage.addLoginRequest({ ...login, requestHash: tokenHash("hash:login") }, created);
  yield* storage.addAgentJoinRequest({ ...join, requestHash: tokenHash("hash:join") }, created);
  yield* close;
  yield* onPostgresDatabase({ statements: BEFORE_REQUEST_ORIGINS, url });
  return url;
});

it.live("a Login request and an agent join request stored before request origins are found after the upgrade", () =>
  Effect.scoped(
    Effect.gen(function* upgradeRequests() {
      const url = yield* requestsStoredBeforeOrigins;
      const { close, storage } = yield* opened(url);
      const now = isoTime("2026-01-01T00:05:00.000Z");
      const found = [
        yield* storage.findLoginRequest("WDJB-MJHT", now),
        yield* storage.findAgentJoinRequest("JOIN-CODE", now),
      ];
      yield* close;

      expect(found).toStrictEqual([
        { approved: false, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
        {
          agent: "triage-agent",
          approved: false,
          createdAt: created,
          expiresAt,
          host: "build-box",
          userCode: "JOIN-CODE",
        },
      ]);
    }),
  ),
);

const BEFORE_LOGIN_LINKS = ["DROP TABLE login_links", "UPDATE schema_version SET version = version - 1"];
const [session, linkHash, redeemed] = [tokenHash("hash:session"), tokenHash("hash:link"), tokenHash("hash:redeemed")];
const linkMadeAt = isoTime("2026-01-01T00:05:00.000Z");
const linkExpires = isoTime("2026-01-01T00:20:00.000Z");

function currentId(sessions: Effect.Success<ReturnType<Storage["Service"]["listSessions"]>>): PublicId {
  return Option.match(
    Arr.findFirst(sessions, ({ current }) => current),
    { onNone: () => expect.unreachable("The stored session is not listed."), onSome: ({ id }) => id },
  );
}

type Revoked = Effect.Success<ReturnType<Storage["Service"]["revokeSession"]>>;

function endedHashes(revoked: Revoked): readonly string[] {
  if (revoked.status === "revoked") {
    return Arr.sort(
      Arr.map(revoked.ended, ({ hash }) => hash),
      Order.String,
    );
  }
  return [];
}

const sessionStoredBeforeLinks = Effect.gen(function* storeSessionBeforeLinks() {
  const url = yield* emptyPostgresDatabase;
  const { close, storage } = yield* opened(url);
  yield* storage.createIdentity(ada, tokenHash("hash:ada"));
  const issue = { credentialHash: session, host: "Safari on macOS", identity: ada.name, now: created };
  yield* storage.issueLoginCredential({ ...issue, parent: tokenHash("hash:ada") });
  yield* close;
  yield* onPostgresDatabase({ statements: BEFORE_LOGIN_LINKS, url });
  return url;
});

it.live(
  "a session stored on Postgres before login links makes a link, and revoking it ends the one redeemed from it",
  () =>
    Effect.scoped(
      Effect.gen(function* upgradeLoginLinks() {
        const url = yield* sessionStoredBeforeLinks;
        const { close, storage } = yield* opened(url);
        yield* storage.addLoginLink({
          createdAt: linkMadeAt,
          expiresAt: linkExpires,
          identity: ada.name,
          linkHash,
          parent: session,
        });
        const redeem = { credentialHash: redeemed, host: "Firefox on macOS", linkHash, now: linkMadeAt };
        const redemption = yield* storage.redeemLoginLink(redeem);
        const id = yield* Effect.map(
          storage.listSessions({ current: session, identity: ada.name, now: linkMadeAt }),
          currentId,
        );
        const revoked = yield* storage.revokeSession({ id, identity: ada.name, now: linkMadeAt });
        yield* close;

        expect(redemption).toMatchObject({ identity: { name: ada.name }, status: "redeemed" });
        expect(endedHashes(revoked)).toStrictEqual([redeemed, session]);
      }),
    ),
);

const BEFORE_REQUEST_KINDS = [
  "DROP TABLE login_links",
  "ALTER TABLE login_requests DROP COLUMN kind",
  "UPDATE schema_version SET version = version - 2",
];

const requestStoredBeforeKinds = Effect.gen(function* storeRequestBeforeKinds() {
  const url = yield* emptyPostgresDatabase;
  const { close, storage } = yield* opened(url);
  yield* storage.createIdentity(ada, tokenHash("hash:ada"));
  yield* storage.addLoginRequest({ ...login, requestHash: tokenHash("hash:login") }, created);
  yield* close;
  yield* onPostgresDatabase({ statements: BEFORE_REQUEST_KINDS, url });
  return url;
});

it.live("a Login request stored on Postgres before request kinds collects as CLI after the upgrade, never as web", () =>
  Effect.scoped(
    Effect.gen(function* upgradeKinds() {
      const url = yield* requestStoredBeforeKinds;
      const { close, storage } = yield* opened(url);
      const now = isoTime("2026-01-01T00:05:00.000Z");
      const requestHash = tokenHash("hash:login");
      yield* storage.approveLoginRequest({ approver: ada.name, now, userCode: "WDJB-MJHT" });
      const asWeb = yield* storage.collectLoginRequest({
        credentialHash: tokenHash("hash:as-web"),
        kind: "web",
        now,
        requestHash,
      });
      const asCli = yield* storage.collectLoginRequest({ credentialHash: tokenHash("hash:as-cli"), now, requestHash });
      yield* close;

      expect([asWeb, asCli]).toMatchObject([{ status: "gone" }, { identity: { name: "ada" }, status: "collected" }]);
    }),
  ),
);

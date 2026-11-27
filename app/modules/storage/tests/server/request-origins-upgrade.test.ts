import { Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, isoTime, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_REQUEST_ORIGINS = new URL("fixtures/before-request-origins.db", import.meta.url);
const created = isoTime("2026-01-01T00:00:00.000Z");
const now = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2999-01-01T00:00:00.000Z");

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_REQUEST_ORIGINS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.effect(
  "a Login request and an agent join request stored on SQLite before request origins are found after it, with no origin",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const path = yield* copiedDatabase;
      const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
      const login = yield* storage.findLoginRequest("WDJB-MJHT", now);
      const join = yield* storage.findAgentJoinRequest("JOIN-CODE", now);
      const approved = yield* storage.approveLoginRequest({
        approver: identityName("ada"),
        now,
        userCode: "WDJB-MJHT",
      });

      expect([login, join, approved]).toStrictEqual([
        { approved: false, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
        {
          agent: "triage-agent",
          approved: false,
          createdAt: created,
          expiresAt,
          host: "build-box",
          userCode: "JOIN-CODE",
        },
        "approved",
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a Login request stored on SQLite before request kinds collects as CLI after the upgrade, never as web", () =>
  Effect.gen(function* upgradeKinds() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const requestHash = tokenHash("hash:login");
    yield* storage.approveLoginRequest({ approver: identityName("ada"), now, userCode: "WDJB-MJHT" });
    const asWeb = yield* storage.collectLoginRequest({
      credentialHash: tokenHash("hash:as-web"),
      kind: "web",
      now,
      requestHash,
    });
    const asCli = yield* storage.collectLoginRequest({ credentialHash: tokenHash("hash:as-cli"), now, requestHash });

    expect([asWeb, asCli]).toMatchObject([{ status: "gone" }, { identity: { name: "ada" }, status: "collected" }]);
  }).pipe(Effect.provide(NodeServices.layer)),
);

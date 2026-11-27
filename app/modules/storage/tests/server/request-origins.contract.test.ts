import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import { Effect } from "effect";
import { tokenHash } from "../../../identities/index.ts";

const created = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2026-01-01T00:10:00.000Z");
const ada = identity("ada", { kind: "human" });
const agent = identity("triage-agent", { kind: "agent", owner: ada.name });
const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const origin = { clientIp: "203.0.113.7", userAgent: firefox };

it.effect.each(storageLayers)(
  "storage contract ($adapter): a login request keeps the client IP and User-Agent it started from, and when",
  ({ layer }) =>
    Effect.gen(function* loginOrigin() {
      const { storage } = yield* openStore(layer);
      yield* storage.addLoginRequest(
        {
          ...origin,
          createdAt: created,
          expiresAt,
          host: "ada-laptop",
          requestHash: tokenHash("hash:login"),
          userCode: "WDJB-MJHT",
        },
        created,
      );
      const found = yield* storage.findLoginRequest("WDJB-MJHT", before);

      expect(found).toStrictEqual({
        ...origin,
        approved: false,
        createdAt: created,
        expiresAt,
        host: "ada-laptop",
        userCode: "WDJB-MJHT",
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent join request keeps the client IP and User-Agent it started from, and when",
  ({ layer }) =>
    Effect.gen(function* joinOrigin() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(ada, tokenHash("hash:ada"));
      yield* storage.createIdentity(agent, tokenHash("hash:agent"));
      yield* storage.addAgentJoinRequest(
        {
          ...origin,
          agent: agent.name,
          createdAt: created,
          expiresAt,
          host: "build-box",
          requestHash: tokenHash("hash:join"),
          userCode: "JOIN-CODE",
        },
        created,
      );
      const found = yield* storage.findAgentJoinRequest("JOIN-CODE", before);

      expect(found).toStrictEqual({
        ...origin,
        agent: agent.name,
        approved: false,
        createdAt: created,
        expiresAt,
        host: "build-box",
        userCode: "JOIN-CODE",
      });
    }),
);

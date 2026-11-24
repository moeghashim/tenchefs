import { Effect, String as Str } from "effect";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const named = [nameOf("ada"), nameOf("release-bot")];

it.effect.each(storageLayers)(
  "storage contract ($adapter): last seen, and whether each identity was online, are kept and read back for the identities asked",
  ({ layer }) =>
    Effect.gen(function* presenceKept() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.createIdentity(identity("release-bot"), hashB);
      const before = yield* storage.listPresence(named);
      yield* Effect.forEach(
        [
          { identity: nameOf("release-bot"), lastSeenAt: isoTime("2026-01-01T00:00:00.000Z"), online: true },
          { identity: nameOf("ada"), lastSeenAt: isoTime("2026-01-01T00:01:00.000Z"), online: true },
          { identity: nameOf("ada"), lastSeenAt: isoTime("2026-01-01T00:02:00.000Z"), online: false },
        ],
        storage.recordPresence,
        ONE_AT_A_TIME,
      );
      const after = yield* storage.listPresence(named);
      const onlyAda = yield* storage.listPresence([nameOf("ada")]);

      expect(before).toStrictEqual([]);
      expect(after).toStrictEqual([
        { identity: "ada", lastSeenAt: "2026-01-01T00:02:00.000Z", online: false },
        { identity: "release-bot", lastSeenAt: "2026-01-01T00:00:00.000Z", online: true },
      ]);
      expect(onlyAda).toStrictEqual([{ identity: "ada", lastSeenAt: "2026-01-01T00:02:00.000Z", online: false }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): asking for no identities' presence finds none",
  ({ layer }) =>
    Effect.gen(function* noneAsked() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.recordPresence({
        identity: nameOf("ada"),
        lastSeenAt: isoTime("2026-01-01T00:00:00.000Z"),
        online: true,
      });
      const none = yield* storage.listPresence([]);

      expect(none).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an offline identity's reason and whether its end was unexpected are kept, and going online again clears them",
  ({ layer }) =>
    Effect.gen(function* endKept() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.createIdentity(identity("release-bot"), hashB);
      yield* Effect.forEach(
        [
          {
            endedUnexpectedly: true,
            identity: nameOf("release-bot"),
            lastSeenAt: isoTime("2026-01-01T00:00:00.000Z"),
            offlineReason: "connection lost",
            online: false,
          },
          {
            endedUnexpectedly: false,
            identity: nameOf("ada"),
            lastSeenAt: isoTime("2026-01-01T00:01:00.000Z"),
            offlineReason: "left",
            online: false,
          },
          { identity: nameOf("ada"), lastSeenAt: isoTime("2026-01-01T00:02:00.000Z"), online: true },
        ] as const,
        storage.recordPresence,
        ONE_AT_A_TIME,
      );
      const after = yield* storage.listPresence(named);

      expect(after).toStrictEqual([
        { identity: "ada", lastSeenAt: "2026-01-01T00:02:00.000Z", online: true },
        {
          endedUnexpectedly: true,
          identity: "release-bot",
          lastSeenAt: "2026-01-01T00:00:00.000Z",
          offlineReason: "connection lost",
          online: false,
        },
      ]);
    }),
);

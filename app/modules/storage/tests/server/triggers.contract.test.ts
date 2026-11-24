import { Effect, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  isoTime,
  messageId,
  identityName as nameOf,
  openStore,
  storageLayers,
  triggerToken,
} from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;
const ONE_BY_ONE = { concurrency: 1 } as const;
const TRIAGE = nameOf("triage");
const ROUTINE_URL = "https://routines.test/fire";
const OTHER_URL = "https://routines.test/other";
const FAILED_AT = isoTime("2026-01-01T00:01:00.000Z");
const CLEARED_AT = isoTime("2026-01-01T00:02:00.000Z");
const SERVER_ERROR = 500;
const OK = 200;
const FIRST_MESSAGE = 1;
const FIRST_TOKEN = triggerToken("first");
const SECOND_TOKEN = triggerToken("second");

function boardOf(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.forEach(
    [
      [identity("ada", { kind: "human" }), "a"],
      [identity("triage", { owner: "ada" }), "b"],
    ] as const,
    ([each, letter]) => storage.createIdentity(each, tokenHash(Str.repeat(HASH_LENGTH)(letter))),
    ONE_AT_A_TIME,
  );
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a trigger URL is kept with its token and its last result",
  ({ layer }) =>
    Effect.gen(function* triggerKept() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      const before = yield* storage.findTrigger(TRIAGE);
      yield* storage.setTrigger(TRIAGE, { token: FIRST_TOKEN, url: ROUTINE_URL });
      const set = yield* storage.findTrigger(TRIAGE);
      yield* storage.recordTriggerResult(TRIAGE, { at: FAILED_AT, ok: false, status: SERVER_ERROR });
      const failed = yield* storage.listTriggers([TRIAGE]);

      expect(before).toBeUndefined();
      expect(set).toStrictEqual({ agent: TRIAGE, token: FIRST_TOKEN, url: ROUTINE_URL });
      expect(failed).toStrictEqual([
        {
          agent: TRIAGE,
          lastResult: { at: FAILED_AT, ok: false, status: SERVER_ERROR },
          token: FIRST_TOKEN,
          url: ROUTINE_URL,
        },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): replacing a trigger URL forgets its last result, and clearing it removes it",
  ({ layer }) =>
    Effect.gen(function* triggerReplaced() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      yield* storage.setTrigger(TRIAGE, { token: FIRST_TOKEN, url: ROUTINE_URL });
      yield* storage.recordTriggerResult(TRIAGE, { at: FAILED_AT, ok: false, status: SERVER_ERROR });
      yield* storage.setTrigger(TRIAGE, { token: SECOND_TOKEN, url: OTHER_URL });
      const replaced = yield* storage.findTrigger(TRIAGE);
      const cleared = yield* Effect.all([storage.clearTrigger(TRIAGE), storage.clearTrigger(TRIAGE)], ONE_BY_ONE);
      const after = yield* storage.listTriggers([TRIAGE]);

      expect(replaced).toStrictEqual({ agent: TRIAGE, token: SECOND_TOKEN, url: OTHER_URL });
      expect([cleared, after]).toStrictEqual([[true, false], []]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a result with no answer keeps its error, and a later one replaces it",
  ({ layer }) =>
    Effect.gen(function* resultsKept() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      yield* storage.setTrigger(TRIAGE, { token: FIRST_TOKEN, url: ROUTINE_URL });
      yield* storage.recordTriggerResult(TRIAGE, { at: FAILED_AT, error: "timed out after 10 s", ok: false });
      const timedOut = yield* storage.findTrigger(TRIAGE);
      yield* storage.recordTriggerResult(TRIAGE, { at: CLEARED_AT, ok: true, status: OK });
      const succeeded = yield* storage.findTrigger(TRIAGE);

      expect(timedOut).toMatchObject({ lastResult: { at: FAILED_AT, error: "timed out after 10 s", ok: false } });
      expect(succeeded).toMatchObject({ lastResult: { at: CLEARED_AT, ok: true, status: OK } });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a trigger failed alert keeps what failed, and only a cleared trigger marks it",
  ({ layer }) =>
    Effect.gen(function* triggerAlert() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      const owner = nameOf("ada");
      const trigger = { message: messageId(FIRST_MESSAGE), status: SERVER_ERROR };
      const raised = yield* storage.recordOfflineAlert({
        agent: TRIAGE,
        offlineReason: "trigger failed",
        owner,
        raisedAt: FAILED_AT,
        trigger,
      });
      const backOnline = yield* storage.markBackOnline(TRIAGE, CLEARED_AT);
      const cleared = yield* storage.markTriggerAlertsCleared(TRIAGE, CLEARED_AT);
      const listed = yield* storage.listOfflineAlerts(owner);

      expect([raised, backOnline]).toMatchObject([{ offlineReason: "trigger failed", trigger }, []]);
      expect([cleared, listed]).toStrictEqual([
        [{ ...raised, backOnlineAt: CLEARED_AT }],
        [{ ...raised, backOnlineAt: CLEARED_AT }],
      ]);
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): deleting an agent drops its trigger URL", ({ layer }) =>
  Effect.gen(function* deletedAgent() {
    const { storage } = yield* openStore(layer);
    yield* boardOf(storage);
    yield* storage.setTrigger(TRIAGE, { token: FIRST_TOKEN, url: ROUTINE_URL });
    yield* storage.deleteIdentity(TRIAGE);
    const listed = yield* storage.listTriggers([TRIAGE]);

    expect(listed).toStrictEqual([]);
  }),
);

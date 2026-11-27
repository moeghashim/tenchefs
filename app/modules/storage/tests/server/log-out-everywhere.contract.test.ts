import { Array as Arr, Effect, Order } from "effect";
import {
  ada,
  adaToken,
  agent,
  agentSessionApprovedBy,
  approvedSession,
  hashesOf,
  later,
  liveOf,
  withPeople,
  workerSession,
} from "./lineage-seeds.ts";
import { expect, it } from "@effect/vitest";
import { openStore, storageLayers } from "../../../testing/server.ts";
import type { StorageUnavailable } from "../../server.ts";
import type { Store } from "./lineage-seeds.ts";
import { tokenHash } from "../../../identities/index.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const [sessionA, sessionB, sessionC, otherOfA, belowC] = [
  tokenHash("hash:a"),
  tokenHash("hash:b"),
  tokenHash("hash:c"),
  tokenHash("hash:other-of-a"),
  tokenHash("hash:below-c"),
];

const everyone = [sessionA, sessionB, sessionC, otherOfA, workerSession, belowC];

function lineageToC(storage: Store): Fails<void> {
  return Effect.gen(function* seedLineage() {
    yield* withPeople(storage);
    yield* approvedSession({ approvedWith: adaToken, hash: sessionA, storage });
    yield* approvedSession({ approvedWith: sessionA, hash: sessionB, storage });
    yield* approvedSession({ approvedWith: sessionB, hash: sessionC, storage });
    yield* approvedSession({ approvedWith: sessionA, hash: otherOfA, storage });
    yield* agentSessionApprovedBy({ approvedWith: sessionA, hash: workerSession, storage });
    yield* approvedSession({ approvedWith: sessionC, hash: belowC, storage });
  });
}

const byCurrentFirst = Order.mapInput(Order.Boolean, ({ current }: { readonly current: boolean }) => !current);

const fromC = { current: sessionC, identity: ada.name, now: later };

it.effect.each(storageLayers)(
  "storage contract ($adapter): Log out everywhere from C, approved by B approved by A, ends A, B and A's other children, and leaves C and its children",
  ({ layer }) =>
    Effect.gen(function* logOutEverywhereFromC() {
      const { storage } = yield* openStore(layer);
      yield* lineageToC(storage);
      const ended = yield* storage.logOutEverywhere(fromC);
      const live = yield* liveOf({ hashes: everyone, storage });

      expect(hashesOf(ended)).toStrictEqual(Arr.sort([sessionA, sessionB, otherOfA, workerSession], Order.String));
      expect(ended).toContainEqual({ hash: workerSession, identity: agent.name, kind: "agent session" });
      expect(live).toStrictEqual([false, false, true, false, false, true]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): after Log out everywhere the session it was sent from is a root",
  ({ layer }) =>
    Effect.gen(function* currentBecomesRoot() {
      const { storage } = yield* openStore(layer);
      yield* lineageToC(storage);
      yield* storage.logOutEverywhere(fromC);
      const listed = yield* storage.listSessions(fromC);

      const shown = Arr.map(listed, (session) => ({ current: session.current, madeBy: "madeBy" in session }));

      expect(Arr.sort(shown, byCurrentFirst)).toStrictEqual([
        { current: true, madeBy: false },
        { current: false, madeBy: true },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the Log out everywhere preview answers what it would end and ends nothing",
  ({ layer }) =>
    Effect.gen(function* previewEndsNothing() {
      const { storage } = yield* openStore(layer);
      yield* lineageToC(storage);
      const preview = yield* storage.previewLogOutEverywhere(fromC);
      const live = yield* liveOf({ hashes: everyone, storage });
      const ended = yield* storage.logOutEverywhere(fromC);

      expect(live).toStrictEqual([true, true, true, true, true, true]);
      expect(hashesOf(preview)).toStrictEqual(hashesOf(ended));
    }),
);

import { Array as Arr, Effect, String as Str } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createTestAgent } from "../../../testing/index.ts";

const BAD_REQUEST = 400;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const required = { code: "display_name_required", status: BAD_REQUEST };

function namesOf(cookout: TestCookoutService): Effect.Effect<readonly string[]> {
  return Effect.map(
    answer(() => cookout.client.listIdentities()),
    ({ identities }) => Arr.map(identities, ({ name }) => name),
  );
}

it.effect("every way of creating an agent refuses one with no display name with 400, and creates nothing", () =>
  Effect.gen(function* refusedCreates() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const refusals = yield* Effect.all(
      [
        refusal(() => createTestAgent({ by: ada.client, displayName: null, name: "by-human" })),
        refusal(() => createTestAgent({ by: cookout.client, displayName: null, name: "by-admin", owner: "ada" })),
        refusal(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: null, name: "by-agent" })),
        refusal(() => ada.client.createJoinCode({ name: "by-join-code" })),
        refusal(() => ada.client.join({ as: "by-join" })),
        refusal(() => ada.client.join({ as: "by-old-join", requireDisplayName: false })),
      ],
      ONE_AT_A_TIME,
    );
    const names = yield* namesOf(cookout);

    expect(refusals).toMatchObject(Arr.makeBy(refusals.length, () => required));
    expect(Arr.filter(names, (name) => Str.startsWith("by-")(name))).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("each way of creating an agent takes its display name", () =>
  Effect.gen(function* namedCreates() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const byHuman = yield* answer(() => createTestAgent({ by: ada.client, displayName: "A", name: "a" }));
    const byAgent = yield* answer(() =>
      createTestAgent({ broughtIn: true, by: chief.client, displayName: "B", name: "b" }),
    );
    const byCode = yield* answer(() => ada.client.createJoinCode({ displayName: " C ", name: "c" }));
    const byJoin = yield* answer(() => ada.client.join({ as: "d", displayName: "D" }));

    expect(Arr.map([byHuman, byAgent, byCode], ({ identity }) => identity.displayName)).toStrictEqual(["A", "B", "C"]);
    expect(byJoin.created).toBe(true);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human still needs no display name, and an existing agent with none still joins", () =>
  Effect.gen(function* unchanged() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("old-bot", { owner: "ada" });
    const human = yield* answer(() => cookout.client.createIdentity({ kind: "human", name: "grace" }));
    const joined = yield* answer(() => ada.client.join({ as: "old-bot" }));

    expect(human.identity.displayName).toBeUndefined();
    expect(joined).toMatchObject({ created: false, identity: "old-bot" });
  }).pipe(Effect.provide(testCookout())),
);

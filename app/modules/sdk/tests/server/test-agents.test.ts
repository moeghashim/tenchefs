import { Array as Arr, Cause, Effect } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { IdentityResponse } from "../../index.ts";
import { createTestAgent } from "../../../testing/index.ts";

it.effect("a test agent shows a display name that differs from its name", () =>
  Effect.gen(function* displayNamed() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const made = yield* answer(() => createTestAgent({ by: ada.client, name: "ada/review-bot" }));
    const owned = yield* answer(() => createTestAgent({ by: cookout.client, name: "auth-2", owner: "ada" }));
    const brought = yield* answer(() => createTestAgent({ broughtIn: true, by: chief.client, name: "worker" }));

    expect(Arr.map([made, owned, brought], ({ identity }) => identity.displayName)).toStrictEqual([
      "Ada Review Bot",
      "Auth 2",
      "Worker",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a brought-in test agent that comes back with a token is refused, since it gets one only from a join", () =>
  Effect.gen(function* tokenRefused() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const withToken = yield* answer(() => createTestAgent({ by: ada.client, name: "helper" }));
    const by = { ...ada.client, createAgentForOwner: (): Promise<IdentityResponse> => Promise.resolve(withToken) };
    const refused = yield* answer(() => createTestAgent({ broughtIn: true, by, name: "helper" })).pipe(
      Effect.sandbox,
      Effect.flip,
      Effect.map(Cause.squash),
    );

    expect(refused).toBeInstanceOf(TypeError);
  }).pipe(Effect.provide(testCookout())),
);

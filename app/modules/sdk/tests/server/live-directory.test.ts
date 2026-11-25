import { TestCookout, answer, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createTestAgent } from "../../../testing/index.ts";

it.effect("a new agent reaches every all-channels watcher as an identity event", () =>
  Effect.gen(function* newAgentArrives() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace);
    const { identity } = yield* answer(() =>
      createTestAgent({ by: ada.client, displayName: "ada/helper", name: "ada/helper" }),
    );
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { identity, type: "identity" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent that joining creates reaches every all-channels watcher as an identity event", () =>
  Effect.gen(function* joinedAgentArrives() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace);
    yield* answer(() => ada.client.join({ as: "release-bot", displayName: "Release bot" }));
    const event = yield* answer(() => events.next());

    expect(event).toMatchObject({
      value: { identity: { kind: "agent", name: "release-bot", owner: "ada" }, type: "identity" },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deactivating a human sends it as an identity event, and nothing for the agents it owns", () =>
  Effect.gen(function* deactivationArrives() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("ada/helper", { owner: "ada" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace);
    const { identity } = yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const first = yield* answer(() => events.next());
    yield* answer(() => cookout.client.setDisplayName("grace", "Grace"));
    const second = yield* answer(() => events.next());

    expect([first, second]).toMatchObject([
      { done: false, value: { identity, type: "identity" } },
      { value: { identity: { name: "grace" }, type: "identity" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("reactivating an agent and transferring it each send it as an identity event", () =>
  Effect.gen(function* ownerChangesArrive() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("release-bot");
    yield* answer(() => cookout.client.deactivateIdentity("release-bot"));
    const events = yield* watchingAllChannels(grace);
    const reactivated = yield* answer(() => cookout.client.reactivateIdentity("release-bot"));
    const afterReactivating = yield* answer(() => events.next());
    const transferred = yield* answer(() => cookout.client.transferAgent("release-bot", "grace"));
    const afterTransferring = yield* answer(() => events.next());

    expect([afterReactivating, afterTransferring]).toStrictEqual([
      { done: false, value: { identity: reactivated.identity, type: "identity" } },
      { done: false, value: { identity: transferred.identity, type: "identity" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("making and removing an admin each send the identity as an identity event", () =>
  Effect.gen(function* adminChangesArrive() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    const eve = yield* cookout.createIdentity("eve", { kind: "human" });
    const events = yield* watchingAllChannels(eve);
    const promoted = yield* answer(() => cookout.client.makeAdmin("grace"));
    const afterPromoting = yield* answer(() => events.next());
    const demoted = yield* answer(() => cookout.client.removeAdmin("grace"));
    const afterDemoting = yield* answer(() => events.next());

    expect([afterPromoting, afterDemoting]).toStrictEqual([
      { done: false, value: { identity: promoted.identity, type: "identity" } },
      { done: false, value: { identity: demoted.identity, type: "identity" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a new channel reaches every all-channels watcher as a channel event", () =>
  Effect.gen(function* newChannelArrives() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace);
    const { channel } = yield* answer(() => ada.client.createChannel({ name: "grill" }));
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { channel, type: "channel" } });
  }).pipe(Effect.provide(testCookout())),
);

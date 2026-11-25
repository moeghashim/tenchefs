import type { CookoutClient, CookoutEvent, EventStream } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";

const nowhere = "http://127.0.0.1:9/command";
const schema = { type: "object" } as const;

function isPresence(next: Readonly<IteratorResult<CookoutEvent, unknown>>): boolean {
  return next.done !== true && next.value.type === "presence";
}

function nextBesidesPresence(
  all: AsyncIterator<CookoutEvent, unknown>,
): Effect.Effect<IteratorResult<CookoutEvent, unknown>> {
  return answer(() => all.next()).pipe(Effect.repeat({ while: isPresence }));
}

interface Feed {
  readonly next: Effect.Effect<IteratorResult<CookoutEvent, unknown>>;
}

function withoutPresence(events: EventStream): Feed {
  return { next: nextBesidesPresence(events[Symbol.asyncIterator]()) };
}

function watchingAllChannels(client: CookoutClient): Effect.Effect<Feed, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch({ allChannels: true })),
      (events: EventStream) => answer(() => events.close()),
    ),
    withoutPresence,
  );
}

it.effect("registering a command and rotating its secret each send it as a command event", () =>
  Effect.gen(function* webhookCommandArrives() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace.client);
    const { command } = yield* answer(() => cookout.client.addCommand({ name: "deploy", schema, url: nowhere }));
    const afterAdding = yield* events.next;
    yield* answer(() => cookout.client.rotateCommandSecret("deploy"));
    const afterRotating = yield* events.next;

    expect([afterAdding, afterRotating]).toStrictEqual([
      { done: false, value: { command, type: "command" } },
      { done: false, value: { command, type: "command" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a channel reaches every all-channels watcher as a channel-deleted event", () =>
  Effect.gen(function* deletionArrives() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const events = yield* watchingAllChannels(grace.client);
    const { channel } = yield* answer(() => cookout.client.deleteChannel("grill"));
    const event = yield* events.next;

    expect(event).toStrictEqual({ done: false, value: { channel, type: "channel-deleted" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin deleting an identity reaches every all-channels watcher as an identity-deleted event", () =>
  Effect.gen(function* identityDeletionArrives() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("e2e-run-1");
    const events = yield* watchingAllChannels(grace.client);
    const { identity } = yield* answer(() => cookout.client.deleteIdentity("e2e-run-1"));
    const event = yield* events.next;

    expect(event).toStrictEqual({ done: false, value: { identity, type: "identity-deleted" } });
  }).pipe(Effect.provide(testCookout())),
);

const sessionEvent = { done: false, value: { agent: "release-bot", type: "agent-session" } } as const;

function heardAfter(events: Feed, act: () => Promise<unknown>): Effect.Effect<unknown> {
  return Effect.andThen(answer(act), events.next);
}

it.effect("an agent's owner hears its agent joining and leaving", () =>
  Effect.gen(function* ownerHearsJoinAndLeave() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    const events = yield* watchingAllChannels(ada.client);
    const { agentSessionToken } = yield* answer(() => ada.client.join({ as: "release-bot" }));
    const afterJoining = yield* events.next;
    const afterLeaving = yield* heardAfter(events, () => cookout.clientFor(agentSessionToken).leave());

    expect([afterJoining, afterLeaving]).toStrictEqual([sessionEvent, sessionEvent]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's owner hears its agent session being revoked", () =>
  Effect.gen(function* ownerHearsRevoke() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    yield* answer(() => ada.client.join({ as: "release-bot" }));
    const events = yield* watchingAllChannels(ada.client);
    const afterRevoking = yield* heardAfter(events, () => ada.client.revokeAgentSession("release-bot"));

    expect(afterRevoking).toStrictEqual(sessionEvent);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin hears an agent's join, and a human who neither owns it nor is an admin doesn't", () =>
  Effect.gen(function* othersHearNothing() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    const [graceHears, adminHears] = yield* Effect.all(
      [watchingAllChannels(grace.client), watchingAllChannels(cookout.client)],
      { concurrency: 1 },
    );
    yield* answer(() => ada.client.join({ as: "release-bot" }));
    const { channel } = yield* answer(() => ada.client.createChannel({ name: "grill" }));
    const heard = yield* Effect.all([graceHears.next, adminHears.next], {
      concurrency: 1,
    });

    expect(heard).toStrictEqual([{ done: false, value: { channel, type: "channel" } }, sessionEvent]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("collecting an approved join request tells the agent's owner", () =>
  Effect.gen(function* approvedJoinArrives() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    const started = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "release-bot", host: "build-box" }));
    yield* answer(() => ada.client.approveAgentJoin(started.userCode));
    const events = yield* watchingAllChannels(ada.client);
    yield* answer(() => cookout.clientFor().collectAgentJoin(started.requestId));
    const event = yield* events.next;

    expect(event).toStrictEqual(sessionEvent);
  }).pipe(Effect.provide(testCookout())),
);

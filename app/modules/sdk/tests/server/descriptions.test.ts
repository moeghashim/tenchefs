import { Effect, String as Str } from "effect";
import { TestCookout, answer, refusal, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const LONGEST = 500;

it.effect("an agent's owner describes it, and every caller on the board reads it from list and get", () =>
  Effect.gen(function* ownerDescribes() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("grace", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const relay = yield* cookout.createIdentity("relay", { owner: "grace" });
    const { identity } = yield* answer(() => ada.client.setDescription("todo-bot", "  Ada's to-dos and life admin "));
    const got = yield* answer(() => relay.client.getIdentity("todo-bot"));
    const listed = yield* answer(relay.client.listIdentities);

    expect(identity).toStrictEqual({ ...bot.identity, description: "Ada's to-dos and life admin" });
    expect([got.identity, listed.identities]).toStrictEqual([identity, expect.arrayContaining([identity])]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent describes itself, and an admin sets and clears any agent's description", () =>
  Effect.gen(function* selfAndAdmin() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const byItself = yield* answer(() => bot.client.setDescription("todo-bot", "Voice-note follow-ups"));
    const byAdmin = yield* answer(() => cookout.client.setDescription("todo-bot", "Ada's to-dos"));
    const cleared = yield* answer(() => cookout.client.setDescription("todo-bot", null));
    const got = yield* answer(() => bot.client.getIdentity("todo-bot"));

    expect([byItself.identity.kind, byAdmin.identity.kind]).toStrictEqual(["agent", "agent"]);
    expect([byItself.identity, byAdmin.identity]).toMatchObject([
      { description: "Voice-note follow-ups" },
      { description: "Ada's to-dos" },
    ]);
    expect([cleared, got]).toStrictEqual([{ identity: bot.identity }, { identity: bot.identity }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("another human or another agent describing an agent is refused with 403 not_owner, and nothing changes", () =>
  Effect.gen(function* refusedCallers() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const other = yield* cookout.createIdentity("other-bot", { owner: "ada" });
    const byHuman = yield* refusal(() => grace.client.setDescription("todo-bot", "Mine now"));
    const byAgent = yield* refusal(() => other.client.setDescription("todo-bot", "Mine now"));
    const got = yield* answer(() => grace.client.getIdentity("todo-bot"));

    expect([byHuman, byAgent]).toMatchObject([
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
    ]);
    expect(got).toStrictEqual({ identity: bot.identity });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human has no description: setting one is refused with 403 identity_kind, even by an admin", () =>
  Effect.gen(function* humanHasNone() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const own = yield* refusal(() => ada.client.setDescription("ada", "A person"));
    const byAdmin = yield* refusal(() => cookout.client.setDescription("ada", "A person"));

    expect([own, byAdmin]).toMatchObject([
      { code: "identity_kind", status: FORBIDDEN },
      { code: "identity_kind", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("getting or describing a missing identity is a 404 identity_not_found", () =>
  Effect.gen(function* missingIdentity() {
    const cookout = yield* TestCookout;
    const got = yield* refusal(() => cookout.client.getIdentity("nobody"));
    const set = yield* refusal(() => cookout.client.setDescription("nobody", "Nobody"));
    const badName = yield* refusal(() => cookout.client.getIdentity("Not A Name"));

    expect([got, set, badName]).toMatchObject([
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a description is 1-500 characters after trimming, and any other is refused with 400", () =>
  Effect.gen(function* lengthRule() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const longest = Str.repeat(LONGEST)("d");
    const kept = yield* answer(() => cookout.client.setDescription("todo-bot", ` ${longest} `));
    const refusals = yield* Effect.forEach(
      ["", "   ", `${longest}d`],
      (description) => refusal(() => cookout.client.setDescription("todo-bot", description)),
      { concurrency: 1 },
    );
    const invalid = { code: "invalid_request", details: [{ path: ["description"] }], status: BAD_REQUEST };

    expect(kept.identity).toMatchObject({ description: longest });
    expect(refusals).toMatchObject([invalid, invalid, invalid]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a description change reaches every all-channels watcher at once as an identity event", () =>
  Effect.gen(function* liveChange() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const events = yield* watchingAllChannels(grace);
    const { identity } = yield* answer(() => ada.client.setDescription("todo-bot", "Ada's to-dos"));
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { identity, type: "identity" } });
  }).pipe(Effect.provide(testCookout())),
);

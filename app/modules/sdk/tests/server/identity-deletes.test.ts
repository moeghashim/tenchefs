import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { createTestAgent } from "../../../testing/index.ts";

const HUMAN = { kind: "human" } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

it.effect("an admin deletes an identity with no messages: its token stops working and its name is free", () =>
  Effect.gen(function* deleteUnused() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("e2e-run-1");
    const answers = yield* Effect.all(
      [
        answer(() => cookout.client.countMessagesBy("e2e-run-1")),
        answer(() => cookout.client.deleteIdentity("e2e-run-1")),
      ],
      ONE_AT_A_TIME,
    );
    const token = yield* refusal(bot.client.whoami);
    const { identities } = yield* answer(() => cookout.client.listIdentities({ include: "deactivated" }));
    const again = yield* answer(() =>
      createTestAgent({ by: cookout.client, displayName: "e2e-run-1", name: "e2e-run-1" }),
    );

    expect(answers).toStrictEqual([{ messages: 0 }, { identity: bot.identity }]);
    expect(token).toMatchObject({ status: UNAUTHORIZED });
    expect(Arr.map(identities, ({ name }) => name)).not.toContain("e2e-run-1");
    expect(again.identity).toMatchObject({ name: "e2e-run-1" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an identity with messages on the board is refused with 409 has_messages, and keeps working", () =>
  Effect.gen(function* refuseWithMessages() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("talker");
    yield* Effect.all(
      [
        answer(() => bot.client.createChannel({ name: "grill" })),
        answer(() => bot.client.createMessage({ channel: "grill", text: "hello" })),
      ],
      ONE_AT_A_TIME,
    );
    const [counted, refused] = yield* Effect.all(
      [answer(() => cookout.client.countMessagesBy("talker")), refusal(() => cookout.client.deleteIdentity("talker"))],
      ONE_AT_A_TIME,
    );
    const still = yield* answer(bot.client.whoami);

    expect(counted).toStrictEqual({ messages: 1 });
    expect(refused).toMatchObject({ code: "has_messages", status: CONFLICT });
    expect(refused.message).toContain("Deactivate it instead");
    expect(still.identity.name).toBe("talker");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human who owns agents is refused with 409 owns_agents, and the last admin with 409 last_admin", () =>
  Effect.gen(function* refuseOwnerAndAdmin() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("ada/helper", { owner: "ada" });
    const answers = yield* Effect.all(
      [refusal(() => cookout.client.deleteIdentity("ada")), refusal(() => cookout.client.deleteIdentity("admin"))],
      ONE_AT_A_TIME,
    );

    expect(answers).toMatchObject([
      { code: "owns_agents", details: { agents: ["ada/helper"] }, status: CONFLICT },
      { code: "last_admin", status: CONFLICT },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only an admin deletes (403 admin_only), and a missing identity is 404 identity_not_found", () =>
  Effect.gen(function* refuseOthers() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("ada/helper", { owner: "ada" });
    const answers = yield* Effect.all(
      [
        refusal(() => ada.client.deleteIdentity("ada/helper")),
        refusal(() => cookout.client.deleteIdentity("nobody")),
        refusal(() => cookout.client.countMessagesBy("nobody")),
      ],
      ONE_AT_A_TIME,
    );

    expect(answers).toMatchObject([
      { code: "admin_only", status: FORBIDDEN },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a command's handler identity removes the command", () =>
  Effect.gen(function* deleteHandler() {
    const cookout = yield* TestCookout;
    yield* answer(() =>
      cookout.client.addCommand({
        name: "deploy",
        schema: { type: "object" },
        url: "https://hooks.example.com/deploy",
      }),
    );
    yield* answer(() => cookout.client.deleteIdentity("deploy"));
    const { commands } = yield* answer(cookout.client.listCommands);

    expect(Arr.map(commands, ({ name }) => name)).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

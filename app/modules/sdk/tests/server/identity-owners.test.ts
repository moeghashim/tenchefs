import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { createTestAgent } from "../../../testing/index.ts";

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const BOOT = "2026-01-01T00:00:00.000Z";
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const HUMAN = { kind: "human" } as const;

it.effect("any human creates an agent it owns, sees its token once, and the list shows the owner", () =>
  Effect.gen(function* selfService() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const [created, named] = yield* Effect.all(
      [
        answer(() => createTestAgent({ by: grace.client, displayName: "helper", name: "helper" })),
        answer(() => createTestAgent({ by: grace.client, displayName: "scout", name: "scout", owner: "grace" })),
      ],
      ONE_AT_A_TIME,
    );
    const whoami = yield* answer(cookout.clientFor(created.token).whoami);
    const { identities } = yield* answer(grace.client.listIdentities);
    const helper = {
      admin: false,
      createdAt: BOOT,
      displayName: "helper",
      kind: "agent",
      name: "helper",
      owner: "grace",
    };

    expect(created.identity).toStrictEqual(helper);
    expect(named.identity).toMatchObject({ name: "scout", owner: "grace" });
    expect(whoami).toStrictEqual({ identity: helper });
    expect(Arr.filter(identities, ({ name }) => name === "helper")).toStrictEqual([helper]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a non-admin human naming another owner, or creating a human, is refused with 403, as is an agent creating a human",
  () =>
    Effect.gen(function* refusedCreates() {
      const cookout = yield* TestCookout;
      yield* cookout.createIdentity("ada", HUMAN);
      const grace = yield* cookout.createIdentity("grace", HUMAN);
      const agent = yield* cookout.createIdentity("helper", { owner: "grace" });
      const refused = yield* Effect.all(
        [
          refusal(() => createTestAgent({ by: grace.client, displayName: "spy", name: "spy", owner: "ada" })),
          refusal(() => grace.client.createIdentity({ kind: "human", name: "eve" })),
          refusal(() => agent.client.createIdentity({ kind: "human", name: "minion" })),
        ],
        ONE_AT_A_TIME,
      );
      const { identities } = yield* answer(cookout.client.listIdentities);

      expect(refused).toMatchObject([
        { code: "admin_only", status: FORBIDDEN },
        { code: "admin_only", status: FORBIDDEN },
        { code: "human_only", status: FORBIDDEN },
      ]);
      expect(Arr.map(identities, ({ name }) => name)).toStrictEqual(["ada", "admin", "grace", "helper"]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin creates an agent owned by any human, and an owner who is no human is refused with 400", () =>
  Effect.gen(function* adminNamesOwner() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    const reviewer = yield* answer(() =>
      createTestAgent({ by: cookout.client, displayName: "reviewer", name: "reviewer", owner: "ada" }),
    );
    const refused = yield* Effect.forEach(
      ["release-bot", "nobody"],
      (owner) => refusal(() => createTestAgent({ by: cookout.client, displayName: "stray", name: "stray", owner })),
      ONE_AT_A_TIME,
    );

    expect(reviewer.identity).toMatchObject({ name: "reviewer", owner: "ada" });
    expect(refused).toMatchObject([
      { code: "owner_not_human", details: { owner: "release-bot" }, status: BAD_REQUEST },
      { code: "owner_not_human", details: { owner: "nobody" }, status: BAD_REQUEST },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("owner/name is an agent's name only when owner owns it, and has one '/' at most", () =>
  Effect.gen(function* namespacedNames() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const own = yield* answer(() =>
      createTestAgent({ by: grace.client, displayName: "grace/helper", name: "grace/helper" }),
    );
    const byAdmin = yield* answer(() =>
      createTestAgent({ by: cookout.client, displayName: "grace/scout", name: "grace/scout", owner: "grace" }),
    );
    const refused = yield* Effect.all(
      [
        refusal(() => createTestAgent({ by: grace.client, displayName: "ada/helper", name: "ada/helper" })),
        refusal(() =>
          createTestAgent({ by: cookout.client, displayName: "ada/helper", name: "ada/helper", owner: "grace" }),
        ),
        refusal(() => createTestAgent({ by: grace.client, displayName: "grace/helper/x", name: "grace/helper/x" })),
        refusal(() => cookout.client.createIdentity({ kind: "human", name: "a/b" })),
      ],
      ONE_AT_A_TIME,
    );

    expect([own.identity, byAdmin.identity]).toMatchObject([
      { name: "grace/helper", owner: "grace" },
      { name: "grace/scout", owner: "grace" },
    ]);
    expect(refused).toMatchObject([
      { code: "name_not_owned", status: BAD_REQUEST },
      { code: "name_not_owned", status: BAD_REQUEST },
      { code: "invalid_request", details: [{ path: ["name"] }], status: BAD_REQUEST },
      { code: "invalid_request", details: [{ message: "A human's name has no '/'.", path: ["name"] }] },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("@owner/name mentions a namespaced agent and reaches its inbox", () =>
  Effect.gen(function* namespacedMention() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const helper = yield* cookout.createIdentity("grace/helper", { owner: "grace" });
    yield* answer(() => grace.client.createChannel({ name: "grill" }));
    const posted = yield* answer(() =>
      grace.client.createMessage({ channel: "grill", text: "@grace/helper look, and @grace/nobody" }),
    );
    const { items } = yield* answer(() => helper.client.inbox());

    expect(posted.message.mentions).toStrictEqual(["grace/helper"]);
    expect(posted.unknownMentions).toStrictEqual(["grace/nobody"]);
    expect(Arr.map(items, ({ message, reasons }) => [message.id, reasons])).toStrictEqual([
      [posted.message.id, ["mention"]],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("whoami, display-name, rotate and deactivate work on a namespaced name", () =>
  Effect.gen(function* namespacedRoutes() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const helper = yield* cookout.createIdentity("grace/helper", { owner: "grace" });
    const whoami = yield* answer(helper.client.whoami);
    const named = yield* answer(() => grace.client.setDisplayName("grace/helper", "Helper"));
    const [rotated, deactivated] = yield* Effect.all(
      [
        answer(() => cookout.client.rotateToken("grace/helper")),
        answer(() => cookout.client.deactivateIdentity("grace/helper")),
      ],
      ONE_AT_A_TIME,
    );
    const gone = yield* refusal(cookout.clientFor(rotated.token).whoami);

    expect(whoami.identity).toMatchObject({ name: "grace/helper", owner: "grace" });
    expect([named, rotated, deactivated]).toMatchObject([
      { identity: { displayName: "Helper", name: "grace/helper" } },
      { identity: { name: "grace/helper" } },
      { identity: { name: "grace/helper" } },
    ]);
    expect(gone).toMatchObject({ code: "token_revoked" });
  }).pipe(Effect.provide(testCookout())),
);

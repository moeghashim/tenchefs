import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { identitiesPath } from "../../../identities/index.ts";

interface RawAnswer {
  readonly json: unknown;
  readonly status: number;
}

const BAD_REQUEST = 400;
const BOOT = "2026-01-01T00:00:00.000Z";
const ONE_AT_A_TIME = { concurrency: 1 } as const;

function postRawIdentity(
  cookout: TestCookoutService,
  body: string,
): Effect.Effect<RawAnswer, never, HttpClient.HttpClient> {
  return HttpClientRequest.post(`${cookout.url}${identitiesPath}`).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${cookout.adminToken}`),
    HttpClientRequest.bodyText(body, "application/json"),
    HttpClient.execute,
    Effect.flatMap((response) => Effect.map(response.json, (json) => ({ json, status: response.status }))),
    Effect.orDie,
  );
}

it.effect("an admin creates a human identity, which has no owner", () =>
  Effect.gen(function* createHuman() {
    const cookout = yield* TestCookout;
    const created = yield* answer(() => cookout.client.createIdentity({ kind: "human", name: "ada" }));
    const whoami = yield* answer(cookout.clientFor(created.token).whoami);

    expect(created.identity).toStrictEqual({ admin: false, createdAt: BOOT, kind: "human", name: "ada" });
    expect(whoami).toStrictEqual({ identity: created.identity });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("creating an identity without a kind, or with an unknown kind, is refused with 400", () =>
  Effect.gen(function* kindRequired() {
    const cookout = yield* TestCookout;
    const missing = yield* postRawIdentity(cookout, '{"name":"no-kind"}');
    const unknown = yield* postRawIdentity(cookout, '{"name":"robot","kind":"robot"}');
    const { identities } = yield* answer(cookout.client.listIdentities);
    const kindRefused = {
      json: { error: { code: "invalid_request", details: [{ path: ["kind"] }] } },
      status: BAD_REQUEST,
    };

    expect([missing, unknown]).toMatchObject([kindRefused, kindRefused]);
    expect(Arr.map(identities, ({ name }) => name)).toStrictEqual(["admin"]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

it.effect("a human with an owner is refused with 400", () =>
  Effect.gen(function* humanWithOwner() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(() => cookout.client.createIdentity({ kind: "human", name: "ada", owner: "matt" }));
    const { identities } = yield* answer(cookout.client.listIdentities);

    expect(error).toMatchObject({
      code: "invalid_request",
      details: [{ message: "A human has no owner.", path: ["owner"] }],
      status: BAD_REQUEST,
    });
    expect(Arr.map(identities, ({ name }) => name)).toStrictEqual(["admin"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an identity keeps the kind it was created with, through a second create and a token rotation", () =>
  Effect.gen(function* kindNeverChanges() {
    const cookout = yield* TestCookout;
    const human = yield* answer(() => cookout.client.createIdentity({ kind: "human", name: "ada" }));
    const agent = yield* answer(() => createTestAgent({ by: cookout.client, displayName: "bot", name: "bot" }));
    const recreated = yield* refusal(() => createTestAgent({ by: cookout.client, displayName: "ada", name: "ada" }));
    const rotated = yield* Effect.forEach(
      ["ada", "bot"],
      (name) => answer(() => cookout.client.rotateToken(name)),
      ONE_AT_A_TIME,
    );
    const now = yield* Effect.forEach(rotated, ({ token }) => answer(cookout.clientFor(token).whoami), ONE_AT_A_TIME);

    expect(recreated).toMatchObject({ code: "identity_exists", status: 409 });
    expect(Arr.map(rotated, ({ identity }) => identity)).toStrictEqual([human.identity, agent.identity]);
    expect(Arr.map(now, ({ identity }) => identity.kind)).toStrictEqual(["human", "agent"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the admin a fresh board makes is a human", () =>
  Effect.gen(function* firstAdminIsHuman() {
    const cookout = yield* TestCookout;
    const { identity } = yield* answer(cookout.client.whoami);

    expect(identity).toStrictEqual({ admin: true, createdAt: BOOT, kind: "human", name: "admin" });
  }).pipe(Effect.provide(testCookout())),
);

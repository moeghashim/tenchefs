import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createCookoutClient } from "../../index.ts";
import { request } from "../../../http/client.ts";
import { whoamiPath } from "../../../identities/index.ts";

const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;

it.effect("a fresh board makes an admin identity that works with the admin token it booted with", () =>
  Effect.gen(function* freshBoardAdmin() {
    const cookout = yield* TestCookout;
    const whoami = yield* answer(cookout.client.whoami);

    expect(cookout.adminToken).toMatch(/^cookout_/u);
    expect(whoami).toStrictEqual({
      identity: { admin: true, createdAt: "2026-01-01T00:00:00.000Z", kind: "human", name: "admin" },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("whoami shows a non-admin identity as not admin", () =>
  Effect.gen(function* nonAdminWhoami() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent", { owner: "matt" });
    const whoami = yield* answer(agent.client.whoami);

    expect(whoami).toStrictEqual({ identity: agent.identity });
    expect(whoami.identity).toMatchObject({ admin: false });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a request with no token gets 401 token_missing", () =>
  Effect.gen(function* noToken() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(cookout.clientFor("").whoami);

    expect(error).toMatchObject({ code: "token_missing", status: 401 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a header that isn't a bearer token gets 401 token_missing", () =>
  Effect.gen(function* notATokenHeader() {
    const cookout = yield* TestCookout;
    const response = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Basic ${cookout.adminToken}` },
        method: "GET",
        path: whoamiPath,
      }),
    );

    expect(response.status).toBe(UNAUTHORIZED);
    expect(response.json).toMatchObject({ error: { code: "token_missing" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a token that was never issued gets 401 token_unknown", () =>
  Effect.gen(function* unknownToken() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(cookout.clientFor("cookout_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").whoami);

    expect(error).toMatchObject({ code: "token_unknown", status: 401 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a server on a store that already has identities makes no new admin", () =>
  Effect.gen(function* secondBoot() {
    const cookout = yield* TestCookout;
    const second = yield* cookout.startSecondServer;
    const { identities } = yield* answer(
      createCookoutClient({ env: {}, token: cookout.adminToken, url: second.url }).listIdentities,
    );

    expect(identities).toStrictEqual([
      { admin: true, createdAt: "2026-01-01T00:00:00.000Z", kind: "human", name: "admin" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("restarting with the same admin token keeps a token rotated since, and the setting's stays revoked", () =>
  Effect.gen(function* restartKeepsRotated() {
    const cookout = yield* TestCookout;
    const rotated = yield* answer(() => cookout.client.rotateToken("admin"));
    const second = yield* cookout.startSecondServer;
    const whoami = yield* answer(createCookoutClient({ env: {}, token: rotated.token, url: second.url }).whoami);
    const old = yield* refusal(createCookoutClient({ env: {}, token: cookout.adminToken, url: second.url }).whoami);

    expect(whoami.identity).toMatchObject({ admin: true, name: "admin" });
    expect(old).toMatchObject({ code: "token_revoked", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a wrong-method request with no token gets 401", () =>
  Effect.gen(function* wrongMethodNoToken() {
    const cookout = yield* TestCookout;
    const response = yield* answer(() => request({ baseUrl: cookout.url, method: "POST", path: whoamiPath }));

    expect(response.status).toBe(UNAUTHORIZED);
    expect(response.json).toMatchObject({ error: { code: "token_missing" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a wrong-method request with a working token gets 405", () =>
  Effect.gen(function* wrongMethodWithToken() {
    const cookout = yield* TestCookout;
    const response = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${cookout.adminToken}` },
        method: "POST",
        path: whoamiPath,
      }),
    );

    expect(response.status).toBe(METHOD_NOT_ALLOWED);
    expect(response.json).toMatchObject({ error: { code: "method_not_allowed" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an unknown path with no token gets 404, not 401", () =>
  Effect.gen(function* unknownPathNoToken() {
    const cookout = yield* TestCookout;
    const response = yield* answer(() => request({ baseUrl: cookout.url, method: "GET", path: "/v1/no-such-route" }));

    expect(response.status).toBe(NOT_FOUND);
    expect(response.json).toMatchObject({ error: { code: "not_found" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a wrong-method health check needs no token", () =>
  Effect.gen(function* wrongMethodHealth() {
    const cookout = yield* TestCookout;
    const response = yield* answer(() => request({ baseUrl: cookout.url, method: "POST", path: "/v1/health" }));

    expect(response.status).toBe(METHOD_NOT_ALLOWED);
  }).pipe(Effect.provide(testCookout())),
);

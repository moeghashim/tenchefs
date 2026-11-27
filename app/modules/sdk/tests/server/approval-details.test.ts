import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { TestCookoutService } from "../../../testing/server.ts";
import { agentJoinRequestsPath } from "../../../agent-sessions/index.ts";
import { loginRequestsPath } from "../../../logins/index.ts";
import { request } from "../../../http/client.ts";

const onFly = { flyAppName: "cookout-test" };
const startedAt = "2026-01-01T00:00:00.000Z";
const firefoxOnMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0";
const nodeFetch = "node";
const unknownBrowser = "Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko)";

interface Start {
  readonly path: string;
  readonly body: object;
  readonly headers: Readonly<Record<string, string>>;
}

function userCodeOf(json: unknown): string {
  if (typeof json === "object" && json !== null && "userCode" in json && typeof json.userCode === "string") {
    return json.userCode;
  }
  return expect.unreachable("The start answered no user code.");
}

function startFrom(cookout: TestCookoutService, { body, headers, path }: Start): Effect.Effect<string> {
  return Effect.map(
    answer(() => request({ baseUrl: cookout.url, body, headers, method: "POST", path })),
    ({ json }) => userCodeOf(json),
  );
}

function loginFrom(cookout: TestCookoutService, headers: Readonly<Record<string, string>>): Effect.Effect<string> {
  return startFrom(cookout, { body: { host: "ada-laptop" }, headers, path: loginRequestsPath });
}

it.effect(
  "on Fly, a Login request from a terminal shows its kind, its host, its Fly-Client-IP and when it started",
  () =>
    Effect.gen(function* terminalLogin() {
      const cookout = yield* TestCookout;
      const ada = yield* cookout.createIdentity("ada", { kind: "human" });
      const userCode = yield* loginFrom(cookout, { "fly-client-ip": "203.0.113.7", "user-agent": nodeFetch });
      const shown = yield* answer(() => ada.client.getLoginRequest(userCode));

      expect(shown.loginRequest).toMatchObject({
        clientIp: "203.0.113.7",
        createdAt: startedAt,
        kind: "terminal",
        where: "ada-laptop",
      });
    }).pipe(Effect.provide(testCookout(onFly))),
);

it.effect("a Login request from a browser shows its browser and OS, and approving answers the same details", () =>
  Effect.gen(function* browserLogin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const userCode = yield* loginFrom(cookout, { "fly-client-ip": "198.51.100.4", "user-agent": firefoxOnMac });
    const approved = yield* answer(() => ada.client.approveLogin(userCode));

    expect(approved.loginRequest).toMatchObject({
      approved: true,
      clientIp: "198.51.100.4",
      createdAt: startedAt,
      kind: "browser",
      where: "Firefox on macOS",
    });
  }).pipe(Effect.provide(testCookout(onFly))),
);

it.effect("on Fly, an agent join request shows its kind, its host, its Fly-Client-IP and when it started", () =>
  Effect.gen(function* agentJoin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("triage", { kind: "agent", owner: "ada" });
    const userCode = yield* startFrom(cookout, {
      body: { as: "triage", host: "build-box" },
      headers: { "fly-client-ip": "203.0.113.9", "user-agent": nodeFetch },
      path: agentJoinRequestsPath,
    });
    const shown = yield* answer(() => ada.client.getAgentJoinRequest(userCode));
    const approved = yield* answer(() => ada.client.approveAgentJoin(userCode, {}));

    expect([shown.agentJoinRequest, approved.agentJoinRequest]).toMatchObject([
      { clientIp: "203.0.113.9", createdAt: startedAt, kind: "agent_join", where: "build-box" },
      { approved: true, clientIp: "203.0.113.9", kind: "agent_join", where: "build-box" },
    ]);
  }).pipe(Effect.provide(testCookout(onFly))),
);

it.effect("off Fly, a request's client IP is the socket's address and a Fly-Client-IP header is ignored", () =>
  Effect.gen(function* offFly() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const userCode = yield* loginFrom(cookout, { "fly-client-ip": "203.0.113.7" });
    const shown = yield* answer(() => ada.client.getLoginRequest(userCode));

    expect(shown.loginRequest.clientIp).toMatch(/127\.0\.0\.1|::1/u);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a Login request from a browser it can't name says so, and one with no User-Agent is a terminal login", () =>
  Effect.gen(function* unnamedOrigins() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const unnamed = yield* loginFrom(cookout, { "user-agent": unknownBrowser });
    const unsent = yield* loginFrom(cookout, { "user-agent": "" });
    const shown = yield* Effect.all(
      [answer(() => ada.client.getLoginRequest(unnamed)), answer(() => ada.client.getLoginRequest(unsent))],
      { concurrency: 1 },
    );

    expect(shown).toMatchObject([
      { loginRequest: { kind: "browser", where: "A browser on an unknown OS" } },
      { loginRequest: { kind: "terminal", where: "ada-laptop" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

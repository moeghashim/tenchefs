import { Array as Arr, Effect, String as Str } from "effect";
import type { HttpRequest, HttpResponse } from "../../../http/client.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { ackPath, inboxPath } from "../../../inbox/index.ts";
import { expect, it } from "@effect/vitest";
import { sessionCookieName, sessionPath, whoamiPath } from "../../../identities/index.ts";
import { messagesPath } from "../../../messages/index.ts";
import { request } from "../../../http/client.ts";

type Call = Omit<HttpRequest, "baseUrl" | "headers">;

const CREATED = 201;
const OK = 200;
const UNAUTHORIZED = 401;
const NO_COOKIE = "";

function cookieAttributes(response: HttpResponse): Arr.NonEmptyReadonlyArray<string> {
  const [cookie = NO_COOKIE] = response.headers.getSetCookie();
  return Str.split("; ")(cookie);
}

function logIn(url: string, token: string): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "POST", path: sessionPath }),
  );
}

function sessionCookie(url: string, token: string): Effect.Effect<string> {
  return Effect.map(logIn(url, token), (response) => Arr.headNonEmpty(cookieAttributes(response)));
}

function withCookie(url: string, cookie: string): (call: Call) => Effect.Effect<HttpResponse> {
  return (call) => answer(() => request({ ...call, baseUrl: url, headers: { cookie } }));
}

it.effect("logging in and out with a human token answers with the identity", () =>
  Effect.gen(function* humanLogsIn() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* logIn(cookout.url, ada.token);
    const loggedIn = yield* answer(ada.client.login);
    const loggedOut = yield* answer(ada.client.logout);

    expect(response.status).toBe(OK);
    expect(response.json).toStrictEqual({ identity: ada.identity });
    expect([loggedIn, loggedOut]).toStrictEqual([{ identity: ada.identity }, { identity: ada.identity }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the session cookie is HttpOnly and SameSite=Strict, for the whole site", () =>
  Effect.gen(function* cookieAttributesOnLogin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* logIn(cookout.url, ada.token);
    const attributes = cookieAttributes(response);

    expect(Arr.headNonEmpty(attributes)).toMatch(new RegExp(`^${sessionCookieName}=cookout_`, "u"));
    expect(attributes).toStrictEqual(expect.arrayContaining(["HttpOnly", "SameSite=Strict", "Path=/"]));
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a request with the session cookie alone acts as that human identity, and the bearer header still works",
  () =>
    Effect.gen(function* cookieActsAsHuman() {
      const cookout = yield* TestCookout;
      const ada = yield* cookout.createIdentity("ada", { kind: "human" });
      const cookie = yield* sessionCookie(cookout.url, ada.token);
      const byCookie = yield* withCookie(cookout.url, cookie)({ method: "GET", path: whoamiPath });
      const byHeader = yield* answer(ada.client.whoami);

      expect(byCookie.json).toStrictEqual({ identity: ada.identity });
      expect(byHeader).toStrictEqual({ identity: ada.identity });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("the bearer header wins over a session cookie for another identity", () =>
  Effect.gen(function* headerWins() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("bot", { owner: "ada" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    const both = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${bot.token}`, cookie },
        method: "GET",
        path: whoamiPath,
      }),
    );

    expect(both.json).toStrictEqual({ identity: bot.identity });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("logging in with an agent token is refused with 403 human_only, naming the kind", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("bot", { owner: "ada" });
    const error = yield* refusal(bot.client.login);
    const response = yield* logIn(cookout.url, bot.token);

    expect(error).toMatchObject({ code: "human_only", details: { kind: "agent" }, status: 403 });
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "logging in with no token is refused with 401 token_missing, and with an unknown one with token_unknown",
  () =>
    Effect.gen(function* noTokenRefused() {
      const cookout = yield* TestCookout;
      const missing = yield* refusal(cookout.clientFor("").login);
      const unknown = yield* refusal(cookout.clientFor("cookout_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").login);

      expect(missing).toMatchObject({ code: "token_missing", status: 401 });
      expect(unknown).toMatchObject({ code: "token_unknown", status: 401 });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a session cookie stops working when the human's token is rotated", () =>
  Effect.gen(function* rotatedCookie() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    yield* answer(() => cookout.client.rotateToken("ada"));
    const response = yield* withCookie(cookout.url, cookie)({ method: "GET", path: whoamiPath });

    expect(response).toMatchObject({ json: { error: { code: "token_unknown" } }, status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a session cookie holds a credential of its own, not the human's identity token", () =>
  Effect.gen(function* ownCredential() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);

    expect(cookie).not.toBe(`${sessionCookieName}=${ada.token}`);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a session cookie stops working when the human is deactivated", () =>
  Effect.gen(function* deactivatedCookie() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const response = yield* withCookie(cookout.url, cookie)({ method: "GET", path: whoamiPath });

    expect(response.status).toBe(UNAUTHORIZED);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human cookie session posts and acks", () =>
  Effect.gen(function* cookiePostsAndAcks() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const { posted: seeded } = yield* Effect.all(
      {
        channel: answer(() => cookout.client.createChannel({ name: "grill" })),
        posted: answer(() => cookout.client.createMessage({ channel: "grill", text: "ready?" })),
        subscribed: answer(() => ada.client.subscribe("grill")),
      },
      { concurrency: 1 },
    );
    const asAda = yield* Effect.map(sessionCookie(cookout.url, ada.token), (cookie) => withCookie(cookout.url, cookie));
    const posted = yield* asAda({ body: { channel: "grill", text: "yes" }, method: "POST", path: messagesPath });
    const acked = yield* asAda({ body: { messageId: seeded.message.id }, method: "POST", path: ackPath });
    const inbox = yield* asAda({ method: "GET", path: inboxPath });

    expect(posted).toMatchObject({ json: { message: { author: { name: "ada" }, text: "yes" } }, status: CREATED });
    expect(acked.status).toBe(OK);
    expect(inbox.json).toStrictEqual({
      agentJoinRequests: [],
      alerts: [],
      deactivatedQuietAgents: [],
      deactivationOffers: [],
      items: [],
      nudges: [],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("logging out clears the session cookie", () =>
  Effect.gen(function* logOut() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    const response = yield* withCookie(cookout.url, cookie)({ method: "DELETE", path: sessionPath });
    const attributes = cookieAttributes(response);

    expect(response.json).toStrictEqual({ identity: ada.identity });
    expect(Arr.headNonEmpty(attributes)).toBe(`${sessionCookieName}=`);
    expect(attributes).toContain("Max-Age=0");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("logging out ends the session on the server: the old cookie is refused, and other logins keep working", () =>
  Effect.gen(function* logOutEnds() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    const otherTab = yield* sessionCookie(cookout.url, ada.token);
    yield* withCookie(cookout.url, cookie)({ method: "DELETE", path: sessionPath });
    const refused = yield* withCookie(cookout.url, cookie)({ method: "GET", path: whoamiPath });
    const other = yield* withCookie(cookout.url, otherTab)({ method: "GET", path: whoamiPath });
    const byToken = yield* answer(ada.client.whoami);

    expect(refused).toMatchObject({ json: { error: { code: "token_unknown" } }, status: UNAUTHORIZED });
    expect([other.json, byToken]).toStrictEqual([{ identity: ada.identity }, { identity: ada.identity }]);
  }).pipe(Effect.provide(testCookout())),
);

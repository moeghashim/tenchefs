import { Array as Arr, Duration, Effect, Fiber, Option, String as Str } from "effect";
import type { HttpResponse, ServerSentEvent, ServerSentFrame } from "../../../http/client.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { eventsPath, refusalEvent } from "../../../events/index.ts";
import { expect, it } from "@effect/vitest";
import { openEventStream, request } from "../../../http/client.ts";
import { sessionPath, whoamiPath } from "../../../identities/index.ts";
import type { CookoutClient } from "../../index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

const UNAUTHORIZED = 401;
const OK = 200;
const EXPIRED = '"code":"login_expired"';
const DAYS_UNUSED = 90;
const NEARLY = 89;
const PAST = 91;
const PAST_A_CHECK = 31;
const loginExpired = {
  code: "login_expired",
  message: "This login ended after 90 days unused. Log in again.",
  status: UNAUTHORIZED,
};

const browserClient: Effect.Effect<CookoutClient, never, TestCookout> = Effect.gen(function* approvedLogin() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const started = yield* answer(() => cookout.clientFor().startLogin({ host: "ada-laptop" }));
  yield* answer(() => ada.client.approveLogin(started.userCode));
  const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
  if (collected.status === "approved") {
    return cookout.clientFor(collected.token);
  }
  return expect.unreachable("The login was not approved.");
});

function credentialOf(cookie: string): string {
  const [, credential = ""] = Str.split("=")(cookie);
  return credential;
}

function sessionCookie(url: string, token: string): Effect.Effect<string> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "POST", path: sessionPath }),
    ),
    (response: HttpResponse) => {
      const [cookie = ""] = response.headers.getSetCookie();
      return Arr.headNonEmpty(Str.split("; ")(cookie));
    },
  );
}

function whoamiWithCookie(url: string, cookie: string): Effect.Effect<HttpResponse> {
  return answer(() => request({ baseUrl: url, headers: { cookie }, method: "GET", path: whoamiPath }));
}

function after(days: number): Effect.Effect<void> {
  return TestClock.adjust(Duration.days(days));
}

function usedAfter(client: CookoutClient, days: number): Effect.Effect<unknown> {
  return Effect.andThen(
    after(days),
    answer(() => client.whoami()),
  );
}

it.effect("a client logged in by browser approval works after 89 days of regular use, and ends 90 days unused", () =>
  Effect.gen(function* regularUse() {
    const client = yield* browserClient;
    yield* usedAfter(client, NEARLY);
    yield* usedAfter(client, NEARLY);
    const stillIn = yield* usedAfter(client, NEARLY);
    yield* after(DAYS_UNUSED);
    const ended = yield* refusal(() => client.whoami());
    const forgotten = yield* refusal(() => client.whoami());

    expect(stillIn).toMatchObject({ identity: { name: "ada" } });
    expect(ended).toMatchObject(loginExpired);
    expect(forgotten).toMatchObject({ code: "token_unknown", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a web session made with POST /v1/session ends with login_expired after 90 days unused", () =>
  Effect.gen(function* webSessionExpires() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    yield* after(NEARLY);
    const used = yield* whoamiWithCookie(cookout.url, cookie);
    yield* after(DAYS_UNUSED);
    const ended = yield* whoamiWithCookie(cookout.url, cookie);

    expect([used.status, ended.status]).toStrictEqual([OK, UNAUTHORIZED]);
    expect(ended.json).toMatchObject({ error: { code: "login_expired" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an Identity token still works after 91 days unused", () =>
  Effect.gen(function* identityTokenLasts() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* after(PAST);
    const me = yield* answer(() => ada.client.whoami());
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    const session = yield* whoamiWithCookie(cookout.url, cookie);

    expect(me).toMatchObject({ identity: { name: "ada" } });
    expect(session.status).toBe(OK);
  }).pipe(Effect.provide(testCookout())),
);

type Frames = AsyncIterator<ServerSentFrame>;

function nextEvent(frames: Frames): Effect.Effect<Option.Option<ServerSentEvent>> {
  return Effect.flatMap(
    answer(() => frames.next()),
    (next: Readonly<IteratorResult<ServerSentFrame>>): Effect.Effect<Option.Option<ServerSentEvent>> => {
      if (next.done === true) {
        return Effect.succeedNone;
      }
      if ("event" in next.value) {
        return Effect.succeedSome(next.value);
      }
      return nextEvent(frames);
    },
  );
}

function eventsUntilEnd(
  frames: Frames,
  seen: readonly ServerSentEvent[] = [],
): Effect.Effect<readonly ServerSentEvent[]> {
  return Effect.flatMap(nextEvent(frames), (next) =>
    Option.match(next, {
      onNone: () => Effect.succeed(seen),
      onSome: (event) => eventsUntilEnd(frames, [...seen, event]),
    }),
  );
}

function webStream(url: string, cookie: string): Effect.Effect<Frames, never, Scope.Scope> {
  return Effect.gen(function* openWebStream() {
    const opened = yield* answer(() =>
      openEventStream({ baseUrl: url, headers: { cookie }, method: "GET", path: eventsPath }),
    );
    if (!opened.ok) {
      return expect.unreachable(`The web stream was refused with ${opened.response.status}.`);
    }
    yield* Effect.addFinalizer(() => answer(() => opened.close()));
    const frames = opened.events[Symbol.asyncIterator]();
    const connected = yield* nextEvent(frames);

    expect(Option.getOrUndefined(connected)).toMatchObject({ event: "connected" });

    return frames;
  });
}

it.effect("a web event stream opened with a Login credential that then expires ends with login_expired", () =>
  Effect.gen(function* streamEnds() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const cookie = yield* sessionCookie(cookout.url, ada.token);
    const stream = yield* webStream(cookout.url, cookie);
    const ending = yield* Effect.forkChild(eventsUntilEnd(stream));
    yield* cookout.ageLogin(credentialOf(cookie), DAYS_UNUSED);
    yield* TestClock.adjust(Duration.seconds(PAST_A_CHECK));
    const ended = yield* Fiber.join(ending);

    expect(Arr.map(ended, ({ data, event }) => [event, Str.includes(EXPIRED)(data)])).toStrictEqual([
      [refusalEvent, true],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

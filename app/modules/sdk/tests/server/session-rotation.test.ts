import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { HttpResponse, ServerSentEvent, ServerSentFrame } from "../../../http/client.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { eventsPath, refusalEvent } from "../../../events/index.ts";
import { expect, it } from "@effect/vitest";
import { openEventStream, request } from "../../../http/client.ts";
import { sessionCookieName, sessionPath, whoamiPath } from "../../../identities/index.ts";
import type { Scope } from "effect";
import { createTestAgent } from "../../../testing/index.ts";

const REVOKED = '"code":"token_revoked"';
const UNAUTHORIZED = 401;

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

function loginCredential(cookout: TestCookoutService, human: TestIdentity): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "ada-laptop" }));
    yield* answer(() => human.client.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

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

interface TwoWebStreams {
  readonly made: Frames;
  readonly other: Frames;
}

function twoWebStreams(
  cookout: TestCookoutService,
  human: TestIdentity,
): Effect.Effect<TwoWebStreams, never, Scope.Scope> {
  return Effect.gen(function* openTwoWebStreams() {
    const madeCookie = yield* sessionCookie(cookout.url, human.token);
    const credential = yield* loginCredential(cookout, human);
    const otherCookie = yield* sessionCookie(cookout.url, credential);
    const made = yield* webStream(cookout.url, madeCookie);
    const other = yield* webStream(cookout.url, otherCookie);
    return { made, other };
  });
}

type Watch = Awaited<ReturnType<TestIdentity["client"]["watch"]>>;

function agentSessionWatch(cookout: TestCookoutService, owner: TestIdentity): Effect.Effect<Watch, never, Scope.Scope> {
  return Effect.gen(function* joinAndWatch() {
    yield* answer(() => createTestAgent({ by: cookout.client, name: "triage", owner: owner.identity.name }));
    const { agentSessionToken } = yield* answer(() => owner.client.join({ as: "triage" }));
    return yield* Effect.acquireRelease(
      answer(() => cookout.clientFor(agentSessionToken).watch()),
      (events) => answer(() => events.close()),
    );
  });
}

it.effect("rotating the human's token ends the login approved with it and the web session made with that login", () =>
  Effect.gen(function* belowTokenEnds() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const credential = yield* loginCredential(cookout, ada);
    const cookie = yield* sessionCookie(cookout.url, credential);
    yield* answer(() => cookout.client.rotateToken("ada"));
    const statuses = yield* Effect.forEach(
      [{ authorization: `Bearer ${credential}` }, { cookie }],
      (headers: Readonly<Record<string, string>>) =>
        Effect.map(
          answer(() => request({ baseUrl: cookout.url, headers, method: "GET", path: whoamiPath })),
          ({ status }) => status,
        ),
      { concurrency: 1 },
    );

    expect(statuses).toStrictEqual([UNAUTHORIZED, UNAUTHORIZED]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("rotating the human's token closes the event streams of every session below it", () =>
  Effect.gen(function* rotatedStreamCloses() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const { made, other } = yield* twoWebStreams(cookout, ada);
    yield* answer(() => cookout.client.rotateToken("ada"));
    const ended = yield* Effect.forEach([made, other], (frames) => eventsUntilEnd(frames), { concurrency: 1 });

    expect(
      Arr.map(ended, (each) => Arr.map(each, ({ data, event }) => [event, Str.includes(REVOKED)(data)])),
    ).toStrictEqual([[[refusalEvent, true]], [[refusalEvent, true]]]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("rotating the human's token closes a web stream whose cookie holds that token itself", () =>
  Effect.gen(function* legacyCookieCloses() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const stream = yield* webStream(cookout.url, `${sessionCookieName}=${ada.token}`);
    yield* answer(() => cookout.client.rotateToken("ada"));
    const ended = yield* eventsUntilEnd(stream);

    expect(Arr.map(ended, ({ data, event }) => [event, Str.includes(REVOKED)(data)])).toStrictEqual([
      [refusalEvent, true],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("rotating an agent's Identity token leaves a watch sent with its agent session token open", () =>
  Effect.gen(function* agentSessionSurvives() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const events = yield* agentSessionWatch(cookout, ada);
    yield* answer(() => cookout.client.rotateToken("triage"));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "@triage still there?" }));
    const next = yield* answer(() => events[Symbol.asyncIterator]().next());

    expect(next).toMatchObject({ done: false, value: { type: "inbox-item" } });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

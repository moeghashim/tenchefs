import { Array as Arr, Effect, Option, Order, String as Str } from "effect";
import type { ServerSentEvent, ServerSentFrame } from "../../../http/client.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { eventsPath, refusalEvent } from "../../../events/index.ts";
import { expect, it } from "@effect/vitest";
import { openEventStream, request } from "../../../http/client.ts";
import { sessionPath, whoamiPath } from "../../../identities/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { Scope } from "effect";
import { createTestAgent } from "../../../testing/index.ts";
import { isPublicId } from "../../../logins/index.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0";
const SESSION_REVOKED = '"code":"token_unknown"';
const UNKNOWN_IDS = Arr.filter(["0000000000000000"], isPublicId);
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "curl/8.5.0",
];

function cliSession(
  cookout: TestCookoutService,
  approver: TestIdentity["client"],
  host: string,
): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host }));
    yield* answer(() => approver.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

function webSession(url: string, token: string, userAgent = FIREFOX_MAC): Effect.Effect<void> {
  return Effect.asVoid(
    answer(() =>
      request({
        baseUrl: url,
        headers: { authorization: `Bearer ${token}`, "user-agent": userAgent },
        method: "POST",
        path: sessionPath,
      }),
    ),
  );
}

function statusWith(url: string, token: string): Effect.Effect<number> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "GET", path: whoamiPath }),
    ),
    ({ status }) => status,
  );
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

function openStream(url: string, token: string): Effect.Effect<Frames, never, Scope.Scope> {
  return Effect.gen(function* openAuthorizedStream() {
    const opened = yield* answer(() =>
      openEventStream({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "GET", path: eventsPath }),
    );
    if (!opened.ok) {
      return expect.unreachable(`The stream was refused with ${opened.response.status}.`);
    }
    yield* Effect.addFinalizer(() => answer(() => opened.close()));
    const frames = opened.events[Symbol.asyncIterator]();
    const connected = yield* nextEvent(frames);

    expect(Option.getOrUndefined(connected)).toMatchObject({ event: "connected" });

    return frames;
  });
}

type Client = TestIdentity["client"];

function sessionIdAt(client: Client, where: string): Effect.Effect<PublicId> {
  return Effect.flatMap(
    answer(() => client.listSessions()),
    ({ sessions }) =>
      Option.match(
        Arr.findFirst(sessions, (session) => session.where === where),
        {
          onNone: () => Effect.die(new Error(`No session at ${where}.`)),
          onSome: ({ id }) => Effect.succeed(id),
        },
      ),
  );
}

interface SessionTree {
  readonly laptop: string;
  readonly desktop: string;
}

function sessionTree(cookout: TestCookoutService, human: TestIdentity): Effect.Effect<SessionTree> {
  return Effect.gen(function* approveInTurn() {
    const laptop = yield* cliSession(cookout, human.client, "ada-laptop");
    const desktop = yield* cliSession(cookout, cookout.clientFor(laptop), "ada-desktop");
    return { desktop, laptop };
  });
}

function approvedWorker(cookout: TestCookoutService, chief: Client): Effect.Effect<string> {
  return Effect.gen(function* approveWorkerJoin() {
    yield* answer(() => createTestAgent({ broughtIn: true, by: chief, displayName: "worker", name: "worker" }));
    const start = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "worker", host: "build-box" }));
    yield* answer(() => chief.approveAgentJoin(start.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectAgentJoin(start.requestId));
    if (collected.status === "approved") {
      return collected.agentSession.agentSessionToken;
    }
    return expect.unreachable("The worker's join was not approved.");
  });
}

const byWhere = Order.mapInput(Order.String, ({ where }: { readonly where: string }) => where);

it.effect("a person lists their live sessions, with where each is, what made it and which one is current", () =>
  Effect.gen(function* listed() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* webSession(cookout.url, ada.token);
    const laptop = yield* cliSession(cookout, ada.client, "ada-laptop");
    const { sessions } = yield* answer(() => cookout.clientFor(laptop).listSessions());

    expect(
      Arr.map(Arr.sort(sessions, byWhere), ({ current, kind, madeBy, where }) => ({ current, kind, madeBy, where })),
    ).toStrictEqual([
      { current: false, kind: "web", madeBy: { kind: "identity token" }, where: "Firefox on macOS" },
      { current: true, kind: "cli", madeBy: { kind: "identity token" }, where: "ada-laptop" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a web session's where is its browser and OS from the User-Agent, else web browser", () =>
  Effect.gen(function* named() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* Effect.forEach(USER_AGENTS, (userAgent) => webSession(cookout.url, ada.token, userAgent), {
      concurrency: 1,
    });
    const { sessions } = yield* answer(() => ada.client.listSessions());

    expect(Arr.map(Arr.sort(sessions, byWhere), ({ where }) => where)).toStrictEqual([
      "Chrome on Android",
      "Chrome on ChromeOS",
      "Edge on Windows",
      "Opera on Linux",
      "Safari on iOS",
      "web browser",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("revoking a session ends the sessions below it, whose next request is 401 and whose stream closes", () =>
  Effect.gen(function* revoked() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const { desktop, laptop } = yield* sessionTree(cookout, ada);
    const stream = yield* openStream(cookout.url, desktop);
    const id = yield* sessionIdAt(ada.client, "ada-laptop");
    const answered = yield* answer(() => ada.client.revokeSession(id));
    const ended = yield* eventsUntilEnd(stream);
    const statuses = yield* Effect.forEach([laptop, desktop], (sent) => statusWith(cookout.url, sent), {
      concurrency: 1,
    });
    const left = yield* answer(() => ada.client.listSessions());

    expect({
      answered,
      ended: Arr.map(ended, ({ data, event }) => [event, Str.includes(SESSION_REVOKED)(data)]),
      left: left.sessions,
      statuses,
    }).toStrictEqual({
      answered: { ended: 2 },
      ended: [[refusalEvent, true]],
      left: [],
      statuses: [UNAUTHORIZED, UNAUTHORIZED],
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("another person's session ID, or an unknown one, is 404 session_not_found and revokes nothing", () =>
  Effect.gen(function* notFound() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const bobs = yield* cliSession(cookout, bob.client, "bob-laptop");
    const bobsId = yield* sessionIdAt(bob.client, "bob-laptop");
    const refused = yield* Effect.forEach(
      [bobsId, ...UNKNOWN_IDS],
      (id) => refusal(() => ada.client.revokeSession(id)),
      { concurrency: 1 },
    );
    const status = yield* statusWith(cookout.url, bobs);
    const malformed = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${ada.token}` },
        method: "DELETE",
        path: "/v1/sessions/not-an-id",
      }),
    );

    expect({ malformed: malformed.status, refused, status }).toMatchObject({
      malformed: NOT_FOUND,
      refused: [
        { code: "session_not_found", status: NOT_FOUND },
        { code: "session_not_found", status: NOT_FOUND },
      ],
      status: OK,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent lists and revokes no sessions: it is 403 human_only", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const listing = yield* refusal(() => chief.client.listSessions());
    const revoking = yield* Effect.forEach(UNKNOWN_IDS, (id) => refusal(() => chief.client.revokeSession(id)), {
      concurrency: 1,
    });

    expect([listing, ...revoking]).toMatchObject([
      { code: "human_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("revoking the agent session that approved a worker's join ends the worker's agent session too", () =>
  Effect.gen(function* workerEnds() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("chief", { owner: "ada" });
    const { agentSessionToken } = yield* answer(() => ada.client.join({ as: "chief" }));
    const worker = yield* approvedWorker(cookout, cookout.clientFor(agentSessionToken));
    const before = yield* statusWith(cookout.url, worker);
    yield* answer(() => ada.client.revokeAgentSession("chief"));
    const after = yield* statusWith(cookout.url, worker);

    expect([before, after]).toStrictEqual([OK, UNAUTHORIZED]);
  }).pipe(Effect.provide(testCookout())),
);

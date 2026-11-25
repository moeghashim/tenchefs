import { Array as Arr, Effect, Logger, Option, Record, Ref, References, Schema, String as Str } from "effect";
import type { CookoutClient, CookoutEvent, SetTriggerRequest } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

const AGENT = "triage";
const TOKEN = "routine-secret-6c1f";
const SECRET_VALUE = "header-secret-91ad";
const VERSION = "2023-06-01";
const HUMAN = { kind: "human" } as const;
const HTTPS_URL = "https://routines.example.com/fire";
const LAST = "last words";
const BAD_REQUEST = 400;
const ONCE = 1;
const BOTH_CALLS = 2;
const NOTHING = 0;
const HEADERS = [
  { name: "anthropic-version", value: VERSION },
  { name: "X-Routine-Key", value: SECRET_VALUE },
];
const NAMES = ["anthropic-version", "x-routine-key"];

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly ada: TestIdentity;
  readonly agent: TestIdentity;
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* mattHisAgentAndAda() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const agent = yield* cookout.createIdentity(AGENT, { owner: "matt" });
  yield* answer(() => matt.client.createChannel({ name: "grill" }));
  return { ada, agent, cookout, matt };
});

const encodeJson = Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

function jsonOf(value: unknown): string {
  return Option.getOrElse(encodeJson(value), () => "");
}

type Seen = Ref.Ref<readonly CookoutEvent[]>;

const tick = TestClock.withLive(Effect.sleep("10 millis"));

function eventOf(step: Readonly<IteratorResult<CookoutEvent, unknown>>): Option.Option<CookoutEvent> {
  if (step.done === true) {
    return Option.none();
  }
  return Option.some(step.value);
}

function collecting(client: CookoutClient): Effect.Effect<Seen, never, Scope.Scope> {
  return Effect.gen(function* collectEvents() {
    const events = yield* Effect.acquireRelease(
      answer(() => client.watch()),
      (stream) => answer(() => stream.close()),
    );
    const iterator = events[Symbol.asyncIterator]();
    const seen = yield* Ref.make<readonly CookoutEvent[]>([]);
    const next = answer(() => iterator.next()).pipe(
      Effect.map(eventOf),
      Effect.tap((event) => Ref.update(seen, (before) => [...before, ...Option.toArray(event)])),
      Effect.repeat({ until: Option.isNone }),
    );
    yield* Effect.forkScoped(next);
    return seen;
  });
}

function heard(seen: Effect.Effect<readonly CookoutEvent[]>, text: string): Effect.Effect<readonly CookoutEvent[]> {
  return seen.pipe(
    Effect.tap(() => tick),
    Effect.repeat({ until: (events) => Str.includes(text)(jsonOf(events)) }),
  );
}

interface Captured {
  readonly logger: Logger.Logger<unknown, number>;
  readonly logged: () => string;
}

function capturedLogs(): Captured {
  const lines: string[] = [];
  const logger = Logger.map(Logger.formatJson, (line) => lines.push(line));
  return { logged: () => Arr.join(lines, "\n"), logger };
}

type SentHeaders = readonly Readonly<Record<string, string | undefined>>[];

function mentionedTwice({ ada, cookout }: Board): Effect.Effect<SentHeaders> {
  return Effect.gen(function* failThenSucceed() {
    yield* cookout.webhook.failNext(ONCE, BAD_REQUEST);
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: `@${AGENT} first` }));
    yield* cookout.webhook.waitForCalls(ONCE);
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: `@${AGENT} ${LAST}` }));
    const calls = yield* cookout.webhook.waitForCalls(BOTH_CALLS);
    return Arr.map(calls, ({ headers }) => ({
      "anthropic-version": headers["anthropic-version"],
      authorization: headers["authorization"],
      "x-routine-key": headers["x-routine-key"],
    }));
  });
}

function everyAnswer({ agent, cookout, matt }: Board): Effect.Effect<readonly unknown[]> {
  return Effect.all(
    [
      answer(() => matt.client.getTrigger(AGENT)),
      answer(() => matt.client.presence()),
      answer(() => matt.client.inbox()),
      answer(() => matt.client.listIdentities()),
      answer(() => cookout.client.listIdentities()),
      answer(() => cookout.client.presence()),
      answer(() => agent.client.whoami()),
      answer(() => matt.client.clearTrigger(AGENT)),
    ],
    { concurrency: 1 },
  );
}

function setAndRead({ cookout, matt }: Board): Effect.Effect<readonly unknown[]> {
  const request = { headers: HEADERS, token: TOKEN, url: cookout.webhook.url };
  return Effect.all(
    [answer(() => matt.client.setTrigger(AGENT, request)), answer(() => matt.client.getTrigger(AGENT))],
    { concurrency: 1 },
  );
}

const drivenBoard = Effect.gen(function* driveTheBoard() {
  const on = yield* board;
  const owner = yield* collecting(on.matt.client);
  const admin = yield* collecting(on.cookout.client);
  const agent = yield* collecting(on.agent.client);
  const shown = yield* setAndRead(on);
  const calls = yield* mentionedTwice(on);
  yield* Effect.all([heard(Ref.get(owner), LAST), heard(Ref.get(owner), "trigger failed")], { concurrency: 1 });
  const answers = yield* everyAnswer(on);
  const sent = yield* Effect.forEach([owner, admin, agent], Ref.get, { concurrency: 1 });
  return { answers: [...shown, ...answers], calls, sent, shown };
});

it.effect("a trigger's extra header values are only sent to the trigger URL: never answered, streamed or logged", () =>
  Effect.gen(function* headerValuesStaySecret() {
    const { logged: loggedNow, logger } = capturedLogs();
    const logs = Logger.layer([logger], { mergeWithExisting: true });
    const { answers, calls, sent, shown } = yield* drivenBoard.pipe(
      Effect.provide(testCookout()),
      Effect.scoped,
      Effect.provide(logs),
    );
    const logged = loggedNow();
    const each = { "anthropic-version": VERSION, authorization: `Bearer ${TOKEN}`, "x-routine-key": SECRET_VALUE };
    const names = { trigger: { headerNames: NAMES } };

    expect(calls).toStrictEqual([each, each]);
    expect(shown).toMatchObject([names, names]);
    expect({
      logged: Str.includes(`trigger URL of ${AGENT}`)(logged),
      sent: Arr.flatten(sent).length > NOTHING,
    }).toStrictEqual({ logged: true, sent: true });
    expect(
      Arr.filter([jsonOf(answers), jsonOf(sent), logged], (text) =>
        Arr.some([TOKEN, SECRET_VALUE, VERSION], (secret) => Str.includes(secret)(text)),
      ),
    ).toStrictEqual([]);
  }).pipe(Effect.provideService(References.MinimumLogLevel, "All")),
);

it.effect("replacing a trigger without headers drops the old ones, and a trigger with none shows no names", () =>
  Effect.gen(function* replaceDropsHeaders() {
    const { ada, cookout, matt } = yield* board;
    const { url } = cookout.webhook;
    yield* answer(() => matt.client.setTrigger(AGENT, { headers: HEADERS, token: TOKEN, url }));
    const replaced = yield* answer(() => matt.client.setTrigger(AGENT, { token: TOKEN, url }));
    const none = yield* answer(() => matt.client.setTrigger(AGENT, { headers: [], token: TOKEN, url }));
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: `@${AGENT} hello` }));
    const calls = yield* cookout.webhook.waitForCalls(ONCE);
    const shown = { trigger: { url: new URL(url).href } };

    expect([replaced, none]).toStrictEqual([shown, shown]);
    expect(Arr.flatMap(calls, ({ headers }) => Record.keys(headers))).not.toContain("x-routine-key");
  }).pipe(Effect.provide(testCookout())),
);

const REFUSED_NAMES = [
  "Authorization",
  "authorization",
  "Connection",
  "keep-alive",
  "proxy-authenticate",
  "Proxy-Authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-type",
  "",
  "two words",
  "colon:name",
];

it.effect.each(REFUSED_NAMES)("a trigger header named %j is refused, and nothing is set", (name) =>
  Effect.gen(function* refuseName() {
    const { matt } = yield* board;
    const headers = [{ name, value: "anything" }];
    const refused = yield* refusal(() => matt.client.setTrigger(AGENT, { headers, token: TOKEN, url: HTTPS_URL }));
    const kept = yield* answer(() => matt.client.getTrigger(AGENT));

    expect([refused, kept]).toMatchObject([{ code: "trigger_header_invalid", status: BAD_REQUEST }, { trigger: null }]);
    expect(refused.message).not.toContain("anything");
  }).pipe(Effect.provide(testCookout())),
);

const TOO_MANY = 21;

const REFUSED_SETS: readonly (readonly [string, NonNullable<SetTriggerRequest["headers"]>])[] = [
  ["a value with a line break", [{ name: "x-key", value: "a\r\nx-injected: yes" }]],
  ["an empty value", [{ name: "x-key", value: "" }]],
  [
    "the same name twice",
    [
      { name: "X-Key", value: "one" },
      { name: "x-key", value: "two" },
    ],
  ],
  ["more than 20 headers", Arr.makeBy(TOO_MANY, (index) => ({ name: `x-key-${String(index)}`, value: "v" }))],
];

it.effect.each(REFUSED_SETS)("a trigger with %s is refused, and nothing is set", ([, headers]) =>
  Effect.gen(function* refuseSet() {
    const { matt } = yield* board;
    const refused = yield* refusal(() => matt.client.setTrigger(AGENT, { headers, token: TOKEN, url: HTTPS_URL }));
    const kept = yield* answer(() => matt.client.getTrigger(AGENT));

    expect([refused, kept]).toMatchObject([{ code: "trigger_header_invalid", status: BAD_REQUEST }, { trigger: null }]);
  }).pipe(Effect.provide(testCookout())),
);

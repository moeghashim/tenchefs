import { Array as Arr, Effect, Option } from "effect";
import type { InboxResponse, Presence, TriggerResponse, TriggerResult } from "../../index.ts";
import { TestCookout, answer } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { TestClock } from "effect/testing";

const AGENT = "triage";
const OTHER = "reviewer";
const HUMAN = { kind: "human" } as const;
const TOKEN = "routine-secret";
const URL_OF = "https://routines.example.com/fire";
const PUBLIC_URL = "https://cookout.example.com";
const AT = "2026-01-01T00:00:00.000Z";
const OK = 200;
const NOT_FOUND = 404;
const SERVER_ERROR = 503;
const UNREACHABLE = "the trigger URL couldn't be reached";
const ONCE = 1;
const TWICE = 2;
const THRICE = 3;

type Matches = (result: TriggerResult) => boolean;

interface People {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly ada: TestIdentity;
  readonly agent: TestIdentity;
}

interface Board extends People {
  readonly settled: (matches: Matches) => Effect.Effect<TriggerResponse>;
  readonly presence: Effect.Effect<Option.Option<Presence>>;
  readonly presenceUntil: (until: (presence: Presence) => boolean) => Effect.Effect<Option.Option<Presence>>;
  readonly mention: (text?: string) => Effect.Effect<number>;
  readonly mentionSettling: (matches: Matches) => Effect.Effect<number>;
  readonly inbox: Effect.Effect<InboxResponse>;
}

const tick = TestClock.withLive(Effect.sleep("5 millis"));

function lastResultIn({ trigger }: TriggerResponse): Option.Option<TriggerResult> {
  return Option.flatMap(Option.fromNullishOr(trigger), ({ lastResult }) => Option.fromNullishOr(lastResult));
}

function settledOn({ matt }: People, matches: Matches): Effect.Effect<TriggerResponse> {
  return answer(() => matt.client.getTrigger(AGENT)).pipe(
    Effect.tap(() => tick),
    Effect.repeat({ until: (answered) => Option.exists(lastResultIn(answered), matches) }),
  );
}

function presenceIn({ matt }: People): Effect.Effect<Option.Option<Presence>> {
  return Effect.map(
    answer(() => matt.client.presence()),
    ({ presence }) => Arr.findFirst(presence, ({ identity }) => identity === AGENT),
  );
}

function mentionBy({ ada }: People, text: string): Effect.Effect<number> {
  return Effect.map(
    answer(() => ada.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

function boardOf(people: People): Board {
  return {
    ...people,
    inbox: answer(() => people.matt.client.inbox()),
    mention: (text = `@${AGENT} look`) => mentionBy(people, text),
    mentionSettling: (matches) => Effect.tap(mentionBy(people, `@${AGENT} look`), () => settledOn(people, matches)),
    presence: presenceIn(people),
    presenceUntil: (until) =>
      presenceIn(people).pipe(
        Effect.tap(() => tick),
        Effect.repeat({ until: (seen) => Option.exists(seen, until) }),
      ),
    settled: (matches) => settledOn(people, matches),
  };
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* boardWithATriggeredAgent() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const agent = yield* cookout.createIdentity(AGENT, { owner: "matt" });
  yield* cookout.createIdentity(OTHER, { owner: "matt" });
  yield* answer(() => matt.client.createChannel({ name: "grill" }));
  yield* answer(() => matt.client.setTrigger(AGENT, { token: TOKEN, url: URL_OF }));
  return boardOf({ ada, agent, cookout, matt });
});

function anyResult(): boolean {
  return true;
}

function failed({ ok }: TriggerResult): boolean {
  return !ok;
}

function succeeded({ ok }: TriggerResult): boolean {
  return ok;
}

function withStatus(status: number): Matches {
  return (result) => result.status === status;
}

export type { Board };
export {
  AGENT,
  AT,
  NOT_FOUND,
  OK,
  ONCE,
  OTHER,
  PUBLIC_URL,
  SERVER_ERROR,
  THRICE,
  TOKEN,
  TWICE,
  UNREACHABLE,
  URL_OF,
  anyResult,
  board,
  failed,
  succeeded,
  withStatus,
};

import { Array as Arr, Effect, Option, Order, Ref, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { InboxItem, MessageId } from "../../../sdk/index.ts";
import { lastSeenAfter, source, start, whileUnavailable } from "./watch-connection.ts";
import type { EventToLog } from "./runner-log.ts";
import type { Heard } from "./watch-connection.ts";
import type { PresenceResponse } from "../../../presence/index.ts";
import type { WakeQueue } from "./wake-queue.ts";
import { callClient } from "./adapters/sdk.ts";
import { printLine } from "./output.ts";
import { watchReplaced } from "../../../presence/index.ts";

const PRESENCE_POLL = "5 seconds";

function isMention(event: Readonly<Heard>): event is Extract<Heard, { readonly type: "inbox-item" }> {
  return event.type === "inbox-item" && Arr.contains(event.item.reasons, "mention");
}

interface Heeding {
  readonly agent: string;
  readonly asAgent: ClientWithAgentSessionState;
  readonly connected: Effect.Effect<unknown>;
  readonly queue: WakeQueue;
  readonly record: (event: EventToLog) => Effect.Effect<void>;
  readonly replaced: Effect.Effect<void>;
}

interface Holding extends Heeding {
  readonly saw: (event: Heard) => Effect.Effect<void>;
  readonly seen: Effect.Effect<Option.Option<MessageId>>;
}

interface Hearing {
  readonly from: Option.Option<MessageId>;
  readonly holding: Holding;
  readonly onConnected: Effect.Effect<void, CallFailure>;
}

function heardUntilReplaced({ from, holding, onConnected }: Hearing): Effect.Effect<void, CallFailure> {
  const { asAgent, connected, queue, saw } = holding;
  const runnerOf = { opened: asAgent, runner: true };
  return Effect.scoped(
    Effect.gen(function* listenAsRunner() {
      const first = yield* start({ from, listening: runnerOf });
      yield* holding.record({ type: "connect" });
      yield* onConnected;
      yield* source({ first, from, listening: runnerOf }).pipe(
        Stream.tap(saw),
        Stream.tap((event) => Effect.when(connected, Effect.succeed(event.type === "connected"))),
        Stream.filter(isMention),
        Stream.runForEach((event) => queue.hear(event.item)),
      );
    }),
  );
}

function isOffline(agent: string): (answer: PresenceResponse) => boolean {
  return ({ presence }) => !Arr.some(presence, ({ identity, online }) => identity === agent && online);
}

function untilOffline({ agent, asAgent }: Holding): Effect.Effect<void, CallFailure> {
  const offline = Effect.map(whileUnavailable(callClient((client) => client.presence())(asAgent)), isOffline(agent));
  const afterAPause = Effect.andThen(Effect.sleep(PRESENCE_POLL), offline);
  return Effect.asVoid(Effect.repeat(afterAPause, { until: Boolean }));
}

function newestOf(items: readonly InboxItem[], seen: Option.Option<MessageId>): Option.Option<MessageId> {
  const ids = [...Arr.map(items, ({ message }) => message.id), ...Option.toArray(seen)];
  return Arr.last(Arr.sort(ids, Order.Number));
}

function takenBack(holding: Holding): Effect.Effect<void, CallFailure> {
  return Effect.gen(function* takeAgentBack() {
    const { items } = yield* whileUnavailable(callClient((client) => client.inbox())(holding.asAgent));
    const seen = yield* holding.seen;
    const onConnected = Effect.andThen(printLine({ agent: holding.agent, type: "reconnected" }), holding.queue.catchUp);
    yield* heardUntilReplaced({ from: newestOf(items, seen), holding, onConnected });
  });
}

function isReplaced(failure: CallFailure): boolean {
  return failure.code === watchReplaced;
}

function whenReplaced(
  holding: Holding,
): (listen: Effect.Effect<void, CallFailure>) => Effect.Effect<void, CallFailure> {
  const said = Effect.andThen(
    Effect.andThen(holding.replaced, holding.record({ type: "stand-down" })),
    printLine({ agent: holding.agent, type: "watch-replaced" }),
  );
  const standDown = Effect.andThen(holding.queue.standDown, Effect.andThen(said, untilOffline(holding)));
  function standingDown(listen: Effect.Effect<void, CallFailure>): Effect.Effect<void, CallFailure> {
    return Effect.catchIf(listen, isReplaced, () => Effect.andThen(standDown, standingDown(takenBack(holding))));
  }
  return standingDown;
}

function heedMentions(heeding: Heeding): Effect.Effect<void, CallFailure> {
  return Effect.gen(function* listenAndStandDown() {
    const lastSeen = yield* Ref.make(Option.none<MessageId>());
    const holding: Holding = {
      ...heeding,
      saw: (event) => Ref.update(lastSeen, lastSeenAfter(event)),
      seen: Ref.get(lastSeen),
    };
    const first = { from: Option.none(), holding, onConnected: heeding.queue.catchUp };
    yield* heardUntilReplaced(first).pipe(whenReplaced(holding));
  });
}

export { heedMentions };

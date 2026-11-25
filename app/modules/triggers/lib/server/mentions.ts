import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  FiberSet,
  Option,
  Predicate,
  Semaphore,
  Stream,
  Struct,
} from "effect";
import type { Message, MessageId } from "../../../messages/index.ts";
import type { Services, Watching } from "./watching.ts";
import type { Storage, StorageUnavailable, StoredTrigger } from "../../../storage/server.ts";
import type { TriggerFailure, TriggerResult } from "../../index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { Scope } from "effect";
import { hrefOf } from "../../../paths/index.ts";
import { isOkStatus } from "../../index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { mentionsOwnAuthor } from "../../../storage/server.ts";
import { shownTrigger } from "./wire.ts";

interface Mentioned {
  readonly message: Message;
  readonly trigger: StoredTrigger;
}

interface Settling extends Mentioned {
  readonly result: TriggerResult;
}

const TIMEOUT_SECONDS = 10;
const TIMED_OUT = `no answer within ${String(TIMEOUT_SECONDS)} s`;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const IN_TURN = { concurrency: 1, discard: true } as const;
const ONE_PERMIT = 1;

function threadOf(message: Message): MessageId {
  if (message.kind === "reply") {
    return message.replyTo;
  }
  return message.id;
}

function textFor(boardUrl: string, message: Message): string {
  const href = hrefOf({ channel: message.channel, message: message.id, name: "thread", thread: threadOf(message) });
  return `${boardUrl}/${href}\n\n${message.text}`;
}

function isMentionedBy(message: Message, agent: IdentityName): boolean {
  return agent !== message.author.name || mentionsOwnAuthor(message);
}

function callable(storage: Storage["Service"], message: Message) {
  return (agent: IdentityName): Effect.Effect<readonly StoredTrigger[], StorageUnavailable> =>
    Effect.gen(function* findCallable() {
      const identity = yield* storage.findIdentityByName(agent);
      const active = Predicate.isNotUndefined(identity) && identity.kind === "agent" && identity.deactivated !== true;
      if (!active || !isMentionedBy(message, agent)) {
        return [];
      }
      const trigger = yield* storage.findTrigger(agent);
      return Option.toArray(Option.fromUndefinedOr(trigger));
    });
}

function mentionedIn(storage: Storage["Service"], message: Message): Effect.Effect<readonly Mentioned[]> {
  return Effect.forEach(message.mentions, callable(storage, message), ONE_AT_A_TIME).pipe(
    Effect.map((found: readonly (readonly StoredTrigger[])[]) =>
      Arr.map(Arr.flatten(found), (trigger) => ({ message, trigger })),
    ),
    Effect.orElseSucceed(Arr.empty),
  );
}

function resultOf(at: TriggerResult["at"], status: number): TriggerResult {
  return { at, ok: isOkStatus(status), status };
}

function callMade(
  caller: Services["caller"],
  boardUrl: Effect.Effect<string>,
  { message, trigger }: Mentioned,
): Effect.Effect<TriggerResult> {
  return Effect.gen(function* callTrigger() {
    const now = yield* DateTime.now;
    const at = isoTimeOf(now);
    const base = yield* boardUrl;
    const text = textFor(base, message);
    return yield* caller.call({ headers: trigger.headers ?? [], text, token: trigger.token, url: trigger.url }).pipe(
      Effect.timeoutOrElse({ duration: Duration.seconds(TIMEOUT_SECONDS), orElse: () => Effect.fail(TIMED_OUT) }),
      Effect.match({
        onFailure: (error): TriggerResult => ({ at, error, ok: false }),
        onSuccess: (status) => resultOf(at, status),
      }),
    );
  });
}

function headerLines({ headers = [] }: StoredTrigger): string {
  return Arr.join(
    Arr.map(headers, ({ name, value }) => `${name}: ${value}`),
    "\n",
  );
}

function sameSecrets(stored: StoredTrigger, made: StoredTrigger): boolean {
  return stored.token === made.token && headerLines(stored) === headerLines(made);
}

function sameTrigger(stored: StoredTrigger | undefined, made: StoredTrigger): stored is StoredTrigger {
  return Predicate.isNotUndefined(stored) && stored.url === made.url && sameSecrets(stored, made);
}

function failedBefore(stored: StoredTrigger): boolean {
  return Option.exists(Option.fromUndefinedOr(stored.lastResult), ({ ok }) => !ok);
}

function failureOf({ message, result }: Settling): TriggerFailure {
  return { ...Struct.omit(result, ["at", "ok"]), message: message.id };
}

function alerted(services: Services, settling: Settling, stored: StoredTrigger): Effect.Effect<void> {
  const { agent } = stored;
  const wasFailing = failedBefore(stored);
  if (settling.result.ok && wasFailing) {
    return services.alerts.triggerCleared(agent);
  }
  if (!settling.result.ok && !wasFailing) {
    return services.alerts.raiseTriggerFailure(agent, failureOf(settling));
  }
  return Effect.void;
}

function announced(services: Services, stored: StoredTrigger): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(services.storage.findIdentityByName(stored.agent), (agent) =>
    Effect.forEach(
      Option.toArray(Option.fromUndefinedOr(agent)),
      (found) => services.changes.publish({ agent: found, trigger: shownTrigger(stored) }),
      IN_TURN,
    ),
  );
}

function settled(services: Services, settling: Settling): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* settle() {
    const { agent } = settling.trigger;
    const stored = yield* services.storage.findTrigger(agent);
    if (!sameTrigger(stored, settling.trigger)) {
      return;
    }
    yield* Effect.logDebug(`Called the trigger URL of ${agent}`, settling.result);
    yield* services.storage.recordTriggerResult(agent, settling.result);
    yield* services.presence.setReach(agent, Option.some({ lastResult: settling.result }));
    yield* alerted(services, settling, stored);
    yield* announced(services, { ...stored, lastResult: settling.result });
  });
}

function watchMentions({ boardUrl, posted, services }: Watching): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* callOnMentions() {
    const running = yield* FiberSet.make();
    const settling = yield* Semaphore.make(ONE_PERMIT);
    function callAndSettle(mentioned: Mentioned): Effect.Effect<void> {
      const unstored = `The result of a trigger call to ${mentioned.trigger.agent} wasn't stored.`;
      return Effect.flatMap(callMade(services.caller, boardUrl, mentioned), (result) =>
        settling.withPermits(ONE_PERMIT)(settled(services, { ...mentioned, result })),
      ).pipe(Effect.ignore({ log: "Warn", message: unstored }));
    }
    function callEach(message: Message): Effect.Effect<void> {
      return Effect.flatMap(mentionedIn(services.storage, message), (mentioned) =>
        Effect.forEach(mentioned, (each) => FiberSet.run(running, callAndSettle(each)), IN_TURN),
      );
    }
    const subscription = yield* posted;
    yield* Effect.forkScoped(Stream.runForEach(Stream.fromSubscription(subscription), callEach));
  });
}

export { watchMentions };

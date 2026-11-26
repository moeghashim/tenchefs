import { Array as Arr, Context, Effect, Layer, Option, Queue, Ref } from "effect";
import type { TriggerAnswer, TriggerCall, TriggerCallerService } from "../../../triggers/server.ts";
import { TriggerCaller } from "../../../triggers/server.ts";
import type { TriggerToken } from "../../../triggers/index.ts";
import { isTriggerToken } from "../../../triggers/index.ts";

type ScriptedAnswer = { readonly status: number; readonly message?: string } | { readonly error: string } | "no answer";

interface ScriptedTriggersService {
  readonly answerNext: (answers: readonly ScriptedAnswer[]) => Effect.Effect<void>;
  readonly calls: Effect.Effect<readonly TriggerCall[]>;
  readonly waitForCalls: (count: number) => Effect.Effect<readonly TriggerCall[]>;
}

class ScriptedTriggers extends Context.Service<ScriptedTriggers, ScriptedTriggersService>()(
  "@ai-hero/cookout/webhook-fake/lib/server/scripted-triggers/ScriptedTriggers",
) {}

const OK: ScriptedAnswer = { status: 200 };
const ONE = 1;

function answered(answer: ScriptedAnswer): Effect.Effect<TriggerAnswer, string> {
  if (answer === "no answer") {
    return Effect.never;
  }
  if ("status" in answer) {
    return Effect.succeed({ message: answer.message ?? "", status: answer.status });
  }
  return Effect.fail(answer.error);
}

interface Scripted {
  readonly caller: TriggerCallerService;
  readonly service: ScriptedTriggersService;
}

const scripted: Effect.Effect<Scripted> = Effect.gen(function* openScriptedTriggers() {
  const made = yield* Ref.make<readonly TriggerCall[]>([]);
  const arrived = yield* Queue.unbounded<true>();
  const script = yield* Ref.make<readonly ScriptedAnswer[]>([]);
  const nextAnswer = Ref.modify(
    script,
    (left) => [Option.getOrElse(Arr.head(left), () => OK), Arr.drop(left, ONE)] as const,
  );
  const caller: TriggerCallerService = {
    call: (call) =>
      Effect.gen(function* answerScripted() {
        yield* Ref.update(made, (calls) => [...calls, call]);
        yield* Queue.offer(arrived, true);
        return yield* Effect.flatMap(nextAnswer, answered);
      }),
  };
  const service: ScriptedTriggersService = {
    answerNext: (answers) => Ref.update(script, (left) => [...left, ...answers]),
    calls: Ref.get(made),
    waitForCalls: (count) =>
      Ref.get(made).pipe(
        Effect.tap((calls) => Effect.when(Queue.take(arrived), Effect.succeed(calls.length < count))),
        Effect.repeat({ until: (calls) => calls.length >= count }),
      ),
  };
  return { caller, service };
});

const scriptedTriggers: Layer.Layer<ScriptedTriggers | TriggerCaller> = Layer.effectContext(
  Effect.map(scripted, ({ caller, service }) =>
    Context.make(ScriptedTriggers, service).pipe(Context.add(TriggerCaller, caller)),
  ),
);

const unusedScriptedTriggers: Layer.Layer<ScriptedTriggers> = Layer.effect(
  ScriptedTriggers,
  Effect.map(scripted, ({ service }) => service),
);

function triggerToken(value: string): TriggerToken {
  return Option.getOrThrow(Option.liftPredicate(value, isTriggerToken));
}

export {
  type ScriptedAnswer,
  ScriptedTriggers,
  type ScriptedTriggersService,
  scriptedTriggers,
  triggerToken,
  unusedScriptedTriggers,
};

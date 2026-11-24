import type { Call, FailureReplyNeeds } from "./failure-reply.ts";
import type { Cause, Config, Scope } from "effect";
import type { CommandName, CommandSecret } from "../../index.ts";
import { Context, DateTime, Duration, Effect, FiberSet, Layer, Ref, Schedule, Schema } from "effect";
import type { DeliveryOutcome, NewCommandCall, StorageUnavailable, StoredDelivery } from "../../../storage/server.ts";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { webhookRetryDelaySeconds, webhookRetryFactor, webhookTimeoutSeconds } from "../../../config/server.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { Token } from "../../../identities/index.ts";
import { failureReply } from "./failure-reply.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { messagesLayer } from "../../../messages/server.ts";

type Calling = Pick<Call, "stored" | "data">;

type Placed = Pick<Call, "channel" | "threadId">;

type CallParts = Omit<NewCommandCall, "message">;

type DeliveriesNeeds = Secrets | Storage | Layer.Services<typeof messagesLayer>;

type PostCall<Failure> = (parts: CallParts) => Effect.Effect<Placed, Failure>;

interface DeliveriesService {
  readonly deliver: <Failure>(
    calling: Calling,
    post: PostCall<Failure>,
  ) => Effect.Effect<Placed, Failure | StorageUnavailable>;
}

interface Backoff {
  readonly timeoutSeconds: number;
  readonly firstDelaySeconds: number;
  readonly factor: number;
}

type Progress = Pick<StoredDelivery, "callId" | "attempts" | "nextAttemptAt">;

interface Delivery {
  readonly call: Call;
  readonly token: Token;
  readonly progress: Progress;
}

interface Settled {
  readonly callId: StoredDelivery["callId"];
  readonly outcome: DeliveryOutcome;
  readonly attempts: number;
  readonly delaySeconds: number;
}

type DeliveryNeeds = Secrets | Storage | FailureReplyNeeds | HttpClient.HttpClient;

type Attempted = "delivered" | "failed" | "gone";

const SIGNATURE_HEADER = "cookout-signature";
const RETRIES = 5;
const NONE = 0;
const ONE = 1;
const COMMAND_TOKEN_LIFETIME: Duration.Input = "24 hours";
const toJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

class Deliveries extends Context.Service<Deliveries, DeliveriesService>()(
  "@ai-hero/cookout/commands/lib/server/delivery/Deliveries",
) {}

const readBackoff: Effect.Effect<Backoff, Config.ConfigError> = Effect.all(
  { factor: webhookRetryFactor, firstDelaySeconds: webhookRetryDelaySeconds, timeoutSeconds: webhookTimeoutSeconds },
  { concurrency: 1 },
);

function delaySecondsAfter({ factor, firstDelaySeconds }: Backoff, failures: number): number {
  return firstDelaySeconds * factor ** (failures - ONE);
}

function untilDue(nextAttemptAt: StoredDelivery["nextAttemptAt"]): Effect.Effect<void> {
  return Effect.flatMap(DateTime.now, (now) => {
    const wait = DateTime.distance(now, DateTime.makeUnsafe(nextAttemptAt));
    return Effect.sleep(Duration.max(wait, Duration.zero));
  });
}

function record({ attempts, callId, delaySeconds, outcome }: Settled): Effect.Effect<void, never, Storage> {
  return Effect.gen(function* recordProgress() {
    const storage = yield* Storage;
    const now = yield* DateTime.now;
    const nextAttemptAt = isoTimeOf(DateTime.addDuration(now, Duration.seconds(delaySeconds)));
    yield* storage.updateDelivery(callId, { attempts, nextAttemptAt, outcome });
  }).pipe(Effect.ignore({ log: "Warn", message: `The progress of the webhook delivery ${callId} wasn't stored.` }));
}

function currentSecret(
  name: CommandName,
): Effect.Effect<CommandSecret, StorageUnavailable | Cause.NoSuchElementError, Storage> {
  return Effect.gen(function* findSecret() {
    const storage = yield* Storage;
    const { secret } = yield* Effect.flatMap(storage.findCommand(name), Effect.fromNullishOr);
    return secret;
  });
}

function webhookRequest({
  call,
  token,
  progress: { callId },
}: Delivery): Effect.Effect<
  HttpClientRequest.HttpClientRequest,
  StorageUnavailable | Cause.NoSuchElementError,
  Secrets | Storage
> {
  return Effect.gen(function* signRequest() {
    const { channel, data, threadId } = call;
    const fields = { callId, channel, command: call.stored.command.name, data, threadId, token };
    const body = yield* Effect.orDie(toJson(fields));
    const secret = yield* currentSecret(call.stored.command.name);
    const secrets = yield* Secrets;
    const signature = yield* secrets.signature(secret, body);
    return HttpClientRequest.post(call.stored.command.url).pipe(
      HttpClientRequest.setHeader(SIGNATURE_HEADER, signature),
      HttpClientRequest.bodyText(body, "application/json"),
    );
  });
}

function attempt(
  delivery: Delivery,
  timeoutSeconds: number,
): Effect.Effect<Attempted, never, Secrets | Storage | HttpClient.HttpClient> {
  return Effect.gen(function* sendWebhook() {
    const storage = yield* Storage;
    const thread = yield* storage.getThread(delivery.call.threadId);
    if (typeof thread !== "object") {
      return "gone" as const;
    }
    const request = yield* webhookRequest(delivery);
    const anyStatus = yield* HttpClient.HttpClient;
    const client = HttpClient.filterStatusOk(anyStatus);
    yield* client.execute(request).pipe(Effect.timeout(Duration.seconds(timeoutSeconds)));
    return "delivered" as const;
  }).pipe(
    Effect.matchEffect({
      onFailure: () =>
        Effect.as(
          Effect.logWarning(`An attempt at the webhook delivery ${delivery.progress.callId} failed.`),
          "failed" as const,
        ),
      onSuccess: (outcome) => Effect.succeed(outcome),
    }),
  );
}

type Settle = (outcome: DeliveryOutcome, extra: number) => Effect.Effect<void, never, Storage>;

interface Finishing {
  readonly attempted: Attempted;
  readonly call: Call;
  readonly settle: Settle;
}

function finish({ attempted, call, settle }: Finishing): Effect.Effect<void, never, DeliveryNeeds> {
  if (attempted === "gone") {
    return Effect.void;
  }
  if (attempted === "delivered") {
    return settle("delivered", ONE);
  }
  return Effect.andThen(failureReply({ call, retries: RETRIES }), settle("failed", NONE));
}

function sendDelivery(backoff: Backoff, delivery: Delivery): Effect.Effect<void, never, DeliveryNeeds> {
  const { call, progress } = delivery;
  const { attempts, callId } = progress;
  return Effect.gen(function* sendUntilSettled() {
    const failed = yield* Ref.make(attempts);
    function settle(outcome: DeliveryOutcome, extra: number): Effect.Effect<void, never, Storage> {
      return Effect.flatMap(Ref.get(failed), (failures) =>
        record({ attempts: failures + extra, callId, delaySeconds: NONE, outcome }),
      );
    }
    const countFailure = Effect.flatMap(
      Ref.updateAndGet(failed, (count) => count + ONE),
      (failures) =>
        record({ attempts: failures, callId, delaySeconds: delaySecondsAfter(backoff, failures), outcome: "pending" }),
    );
    const schedule = Schedule.exponential(Duration.seconds(delaySecondsAfter(backoff, attempts + ONE)), backoff.factor);
    yield* untilDue(progress.nextAttemptAt);
    const attempted = yield* attempt(delivery, backoff.timeoutSeconds).pipe(
      Effect.tap((outcome) => Effect.when(countFailure, Effect.succeed(outcome === "failed"))),
      Effect.repeat({ schedule, times: Math.max(RETRIES - attempts, NONE), until: (outcome) => outcome !== "failed" }),
    );
    yield* finish({ attempted, call, settle });
  });
}

interface IssuedToken {
  readonly token: Token;
  readonly stored: CallParts["token"];
}

const newCommandToken = Effect.fnUntraced(function* issueCommandToken(
  { stored }: Calling,
  calledAt: DateTime.Utc,
): Effect.fn.Return<IssuedToken, never, Secrets> {
  const secrets = yield* Secrets;
  const token = yield* secrets.newCommandToken;
  const hash = yield* secrets.hashToken(token);
  const expiresAt = isoTimeOf(DateTime.addDuration(calledAt, COMMAND_TOKEN_LIFETIME));
  return { stored: { expiresAt, handler: stored.command.handler, hash }, token };
});

const calledAtOf = Effect.fnUntraced(function* findCallTime(
  call: Call,
): Effect.fn.Return<DateTime.Utc, StorageUnavailable, Storage> {
  const storage = yield* Storage;
  const thread = yield* Effect.flatMap(storage.getThread(call.threadId), (found) =>
    Effect.orDie(Effect.fromNullishOr(found)),
  );
  return DateTime.makeUnsafe(thread.parent.createdAt);
});

const newDelivery = Effect.fnUntraced(function* startDelivery({
  data,
  stored,
}: Calling): Effect.fn.Return<CallParts["delivery"], never, Secrets> {
  const secrets = yield* Secrets;
  const callId = yield* secrets.newCallId;
  const now = yield* DateTime.now;
  return {
    attempts: NONE,
    callId,
    command: stored.command.name,
    data,
    nextAttemptAt: isoTimeOf(now),
    outcome: "pending",
  };
});

const callOf = Effect.fnUntraced(function* findCall(
  pending: StoredDelivery,
): Effect.fn.Return<Call, StorageUnavailable, Storage> {
  const storage = yield* Storage;
  const found = yield* storage.findCommand(pending.command);
  const stored = yield* Effect.orDie(Effect.fromNullishOr(found));
  return { channel: pending.channel, data: pending.data, stored, threadId: pending.threadId };
});

function deliveriesWith(
  backoff: Backoff,
): Effect.Effect<DeliveriesService, StorageUnavailable, DeliveryNeeds | Scope.Scope> {
  return Effect.gen(function* startDeliveries() {
    const running = yield* FiberSet.make();
    const runInBackground = yield* FiberSet.runtime(running)<DeliveryNeeds>();
    const services = yield* Effect.context<Secrets | Storage>();
    function sendInBackground(delivery: Delivery): Effect.Effect<void> {
      return Effect.sync(() => {
        runInBackground(sendDelivery(backoff, delivery));
      });
    }
    function resume(pending: StoredDelivery): Effect.Effect<void, StorageUnavailable, Secrets | Storage> {
      return Effect.gen(function* resumeDelivery() {
        const call = yield* callOf(pending);
        const calledAt = yield* calledAtOf(call);
        const { stored, token } = yield* newCommandToken(call, calledAt);
        const storage = yield* Storage;
        yield* storage.addCommandToken({ ...stored, threadId: call.threadId });
        yield* sendInBackground({ call, progress: pending, token });
      });
    }
    function deliver<Failure>(
      calling: Calling,
      post: PostCall<Failure>,
    ): Effect.Effect<Placed, Failure | StorageUnavailable> {
      return Effect.gen(function* postAndSend() {
        const now = yield* DateTime.now;
        const { stored, token } = yield* newCommandToken(calling, now);
        const delivery = yield* newDelivery(calling);
        const placed = yield* post({ delivery, token: stored });
        yield* sendInBackground({ call: { ...calling, ...placed }, progress: delivery, token });
        return placed;
      }).pipe(Effect.provideContext(services));
    }
    const storage = yield* Storage;
    const pending = yield* storage.listPendingDeliveries;
    yield* Effect.forEach(pending, resume, { concurrency: 1, discard: true });
    return Deliveries.of({ deliver });
  });
}

const neverRedirected = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
);

const deliveriesLayer: Layer.Layer<Deliveries, Config.ConfigError | StorageUnavailable, DeliveriesNeeds> = Layer.effect(
  Deliveries,
  Effect.flatMap(readBackoff, deliveriesWith),
).pipe(Layer.provide(Layer.merge(neverRedirected, messagesLayer)));

export { Deliveries, deliveriesLayer };

import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Logger,
  MutableRef,
  Option,
  Path,
  Redacted,
  Ref,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { Context, Scope } from "effect";
import type { CookoutClient, JsonValue, Message, MessageId } from "@ai-hero/cookout/sdk";
import { expect, it } from "@effect/vitest";
import { handlerListener, handlerUrl, serveHandler } from "../../server.ts";
import type { HttpServer } from "effect/http";
import { NodeServices } from "@effect/platform-node";
import { createCookoutClient } from "@ai-hero/cookout/sdk";

interface RunningCookout {
  readonly admin: CookoutClient;
  readonly url: string;
}

interface Handled<Value> {
  readonly statuses: readonly number[];
  readonly value: Value;
}

interface Handler {
  readonly listener: Context.Context<HttpServer.HttpServer>;
  readonly secret: string;
}

type Needs = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope;

const COOKOUT_BIN = new URL("../../../../../node_modules/@ai-hero/cookout/app/main.ts", import.meta.url);
const SCHEMA = { type: "object" };
const WAIT_STEP = "25 millis";
const WAIT_STEPS = 400;
const ONE_REPLY = 1;
const ACCEPTED = 202;
const UNAVAILABLE = 503;
const DELIVERY_FAILED = "The delivery of /echo to its handler failed after 5 retries.";
const WRONG_SECRET = "not-the-command-secret";
const ANY_FREE_PORT = { host: "127.0.0.1", port: 0 };
const ADMIN_TOKEN = "handler-example-admin-token-0123456789abcdef";
const SERVE_ENV = {
  COOKOUT_ADMIN_TOKEN: ADMIN_TOKEN,
  COOKOUT_WEBHOOK_RETRY_DELAY_SECONDS: "0",
  COOKOUT_WEBHOOK_RETRY_FACTOR: "1",
};

const REFUSED_WARNING = /The result reply for call call_\S+ could not be posted: [a-z_]+: ./u;

const isListening = Schema.is(Schema.Struct({ listening: Schema.String }));
const jsonLineIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

function serveArgs(bin: string, database: string): readonly string[] {
  return [bin, "serve", "--port", "0", "--host", "127.0.0.1", "--db", database];
}

function startupLines<Failure>(stdout: Stream.Stream<Uint8Array, Failure>): Effect.Effect<readonly unknown[], Failure> {
  return stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map((line) => Option.getOrNull(jsonLineIn(line))),
    Stream.takeUntil(isListening),
    Stream.runCollect,
  );
}

const startCookout: Effect.Effect<RunningCookout, never, Needs> = Effect.gen(function* serveCookout() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "cookout-handler-example-" });
  const bin = yield* path.fromFileUrl(COOKOUT_BIN);
  const command = ChildProcess.make(process.execPath, serveArgs(bin, path.join(folder, "cookout.db")), {
    env: SERVE_ENV,
    extendEnv: false,
  });
  const lines = yield* startupLines((yield* spawner.spawn(command)).stdout);
  const { listening } = Option.getOrThrow(Arr.findFirst(lines, isListening));
  return { admin: createCookoutClient({ token: ADMIN_TOKEN, url: listening }), url: listening };
}).pipe(Effect.orDie);

function answer<Value>(send: () => Promise<Value>): Effect.Effect<Value> {
  return Effect.promise(send);
}

function runHandler<Value>(
  cookout: RunningCookout,
  handler: Handler,
  use: Effect.Effect<Value>,
): Effect.Effect<Handled<Value>> {
  return Effect.gen(function* serveOnListener() {
    const statuses = yield* Ref.make<readonly number[]>([]);
    const serving = serveHandler({
      cookoutUrl: cookout.url,
      onCall: (_call, status) => Ref.update(statuses, (before) => [...before, status]),
      secret: Redacted.make(handler.secret),
    }).pipe(Layer.provide(Layer.succeedContext(handler.listener)));
    const value = yield* Effect.provide(use, serving);
    return { statuses: yield* Ref.get(statuses), value };
  });
}

function addEcho(cookout: RunningCookout): Effect.Effect<Handler, never, Scope.Scope> {
  return Effect.gen(function* addCommand() {
    const listener = yield* Effect.orDie(Layer.build(handlerListener(ANY_FREE_PORT)));
    const url = yield* Effect.provideContext(handlerUrl, listener);
    const { secret } = yield* answer(() =>
      cookout.admin.addCommand({ name: "echo", schema: SCHEMA, url: `${url}/webhook` }),
    );
    yield* answer(() => cookout.admin.createChannel({ name: "grill" }));
    return { listener, secret };
  });
}

function callEcho(cookout: RunningCookout, data: Readonly<Record<string, JsonValue>>): Effect.Effect<MessageId> {
  return answer(() => cookout.admin.callCommand("echo", { channel: "grill", data })).pipe(
    Effect.map(({ threadId }) => threadId),
  );
}

function repliesOnceThereIs(cookout: RunningCookout, threadId: MessageId): Effect.Effect<readonly Message[]> {
  return answer(() => cookout.admin.getThread(threadId)).pipe(
    Effect.repeat({
      schedule: Schedule.spaced(WAIT_STEP),
      times: WAIT_STEPS,
      until: ({ replies }) => replies.length >= ONE_REPLY,
    }),
    Effect.map(({ replies }) => replies),
  );
}

it.live("a signed call gets 2xx and the handler's result reply appears in the call's thread", () =>
  Effect.gen(function* signedCall() {
    const cookout = yield* startCookout;
    const handler = yield* addEcho(cookout);
    const { statuses, value } = yield* runHandler(
      cookout,
      handler,
      Effect.gen(function* call() {
        const called = yield* callEcho(cookout, { text: "hello" });
        const arrived = yield* repliesOnceThereIs(cookout, called);
        return { replies: arrived, threadId: called };
      }),
    );

    expect(value.replies).toMatchObject([
      {
        author: { name: "echo" },
        channel: "grill",
        data: { received: { text: "hello" } },
        kind: "reply",
        replyTo: value.threadId,
        text: "/echo is done.",
      },
    ]);
    expect(statuses).toStrictEqual([ACCEPTED]);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.live("a call signed with another secret gets 401 every time and the handler posts no reply", () =>
  Effect.gen(function* wrongSecret() {
    const cookout = yield* startCookout;
    const handler = yield* addEcho(cookout);
    const { statuses, value: replies } = yield* runHandler(
      cookout,
      { ...handler, secret: WRONG_SECRET },
      Effect.flatMap(callEcho(cookout, { text: "hello" }), (threadId) => repliesOnceThereIs(cookout, threadId)),
    );

    expect(replies).toMatchObject([{ author: { name: "echo" }, text: DELIVERY_FAILED }]);
    expect(statuses).toStrictEqual([]);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.live("in fail-first mode the first delivery of a call fails and the retry posts the result reply", () =>
  Effect.gen(function* failFirst() {
    const cookout = yield* startCookout;
    const handler = yield* addEcho(cookout);
    const { statuses, value: replies } = yield* runHandler(
      cookout,
      handler,

      Effect.flatMap(callEcho(cookout, { failFirst: true, text: "hello" }), (threadId) =>
        repliesOnceThereIs(cookout, threadId),
      ),
    );

    expect(replies).toMatchObject([
      { author: { name: "echo" }, data: { received: { failFirst: true, text: "hello" } }, text: "/echo is done." },
    ]);
    expect(statuses).toStrictEqual([UNAVAILABLE, ACCEPTED]);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.live("a result reply the cookout refuses is logged with the refusal's code", () =>
  Effect.gen(function* refusedReply() {
    const cookout = yield* startCookout;
    const handler = yield* addEcho(cookout);
    const warnings = MutableRef.make<readonly string[]>([]);
    const collect = Logger.map(Logger.formatSimple, (line) =>
      MutableRef.update(warnings, (before) => [...before, line]),
    );
    const elsewhere = { ...cookout, url: `${cookout.url}/elsewhere` };
    yield* runHandler(
      elsewhere,
      handler,
      Effect.flatMap(callEcho(cookout, { text: "hello" }), () =>
        Effect.sync(() => MutableRef.get(warnings)).pipe(
          Effect.repeat({
            schedule: Schedule.spaced(WAIT_STEP),
            times: WAIT_STEPS,
            until: Arr.isReadonlyArrayNonEmpty,
          }),
        ),
      ),
    ).pipe(Effect.provide(Logger.layer([collect])));

    expect(MutableRef.get(warnings)).toStrictEqual([expect.stringMatching(REFUSED_WARNING)]);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

#!/usr/bin/env node
/**
 * The example handler program: the one place its effects run. It reads
 * `COOKOUT_COMMAND_SECRET` (the command's HMAC secret, shown once by
 * `cookout command add`), `COOKOUT_URL` (the cookout it posts result replies
 * to), `HOST` (default `0.0.0.0`) and `PORT` (default 8787), and serves
 * until stopped.
 */
import { Config, Console, Effect, Layer } from "effect";
import { handlerListener, handlerUrl, serveHandler } from "./modules/handler/server.ts";
import { NodeRuntime } from "@effect/platform-node";

const DEFAULT_PORT = 8787;

const options = Config.all({
  cookoutUrl: Config.String("COOKOUT_URL"),
  host: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.Port("PORT").pipe(Config.withDefault(DEFAULT_PORT)),
  secret: Config.Redacted("COOKOUT_COMMAND_SECRET"),
});

const program = Effect.gen(function* serve() {
  const read = yield* options;
  const server = serveHandler({
    ...read,
    onCall: (call, status) =>
      Console.log(`call ${call.callId} of ${call.command} on thread ${String(call.threadId)}: ${String(status)}`),
  }).pipe(Layer.provideMerge(handlerListener(read)));
  const listening = Effect.flatMap(handlerUrl, (url) => Console.log(`handler listening on ${url}`));
  return yield* Layer.launch(Layer.effectDiscard(listening).pipe(Layer.provideMerge(server)));
});

NodeRuntime.runMain(program);

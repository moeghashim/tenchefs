import {
  Array as Arr,
  Cause,
  Console,
  Effect,
  Function,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
  String as Str,
} from "effect";
import { BoardUrl, boardUrlLayer, domainLayers, openRoutes, routes, triggerCallerLive } from "./route-list.ts";
import { Command, Flag } from "effect/cli";
import { CommandFailed, printLine, refused } from "./output.ts";
import type { IdentityName, Token } from "../../../identities/index.ts";
import type { ServeLayers, ServedStorage } from "./serve-stores.ts";
import {
  adminName,
  adminNameRule,
  adminToken,
  adminTokenRule,
  databasePath,
  host,
  port,
  publicUrl,
} from "../../../config/server.ts";
import { chosenAssetStore, servedStorage } from "./serve-stores.ts";
import { firstAdminName, token } from "../../../identities/index.ts";
import { httpServer, serverUrl } from "../../../http/server.ts";

import type { AdminNameIsAgent } from "../../../identities/server.ts";
import type { Serving } from "../../../http/server.ts";
import { adminTokenSet } from "../../../identities/server.ts";
import { requireTokenWithinLimit } from "./gate.ts";

export type { ServeLayers } from "./serve-stores.ts";

const boardUrlServed = Layer.effectDiscard(
  Effect.gen(function* tellBoardUrlTheServedAddress() {
    const boardUrl = yield* BoardUrl;
    const address = yield* serverUrl;
    yield* boardUrl.served(address);
  }),
);

export const cookoutServer = ({
  adminName: name = firstAdminName,
  adminToken: admin,
  ...serving
}: Serving & { readonly adminToken: Token; readonly adminName?: IdentityName }) =>
  Layer.provideMerge(
    boardUrlServed,
    httpServer(serving, { gated: routes, open: openRoutes }, requireTokenWithinLimit),
  ).pipe(
    Layer.provideMerge(adminTokenSet({ adminName: name, adminToken: admin })),
    Layer.provideMerge(domainLayers),
    Layer.provideMerge(boardUrlLayer(serving.publicUrl ?? "")),
  );

function webFolderOf({ webFolder }: ServeLayers): Pick<Serving, "webFolder"> {
  return Option.match(Option.fromNullishOr(webFolder), {
    onNone: () => ({}),
    onSome: (folder) => ({ webFolder: folder }),
  });
}

const invalidAdminToken = { code: "admin_token_invalid", message: adminTokenRule };

const adminTokenOrRefuse = Effect.gen(function* readAdminToken() {
  const value = yield* adminToken;
  return token(Redacted.value(value));
}).pipe(Effect.catchTag("ConfigError", () => refused(invalidAdminToken)));

const invalidAdminName = { code: "admin_name_invalid", message: adminNameRule };

const adminNameOrRefuse = adminName.pipe(Effect.catchTag("ConfigError", () => refused(invalidAdminName)));

function adminNameIsAgent({
  adminName: name,
}: Pick<AdminNameIsAgent, "adminName">): Effect.Effect<never, CommandFailed> {
  const agentName = {
    code: "admin_name_agent",
    message: `COOKOUT_ADMIN_NAME is ${name}, an agent on this board, and only a human can be an admin. Choose another name.`,
  };
  return refused(agentName);
}

function storageUnavailable(
  redact: (text: string) => string,
): (failure: { readonly message: string }) => Effect.Effect<never, CommandFailed> {
  return ({ message }) => {
    const unavailable = { code: "storage_unavailable", message: redact(message) };
    return refused(unavailable);
  };
}

const isCommandFailed = Schema.is(CommandFailed);
const lineBreaks = /\s*\n\s*/gv;
const serveFailed = Effect.fail(CommandFailed.make({ code: "serve_failed" }));

function textProperty(failure: unknown, key: string): Option.Option<string> {
  if (!Predicate.hasProperty(failure, key)) {
    return Option.none();
  }
  const value: unknown = failure[key];
  return Option.liftPredicate(value, Predicate.isString);
}

function messageOf(failure: unknown): string {
  const message = Option.filter(textProperty(failure, "message"), Str.isNonEmpty);
  if (Option.isSome(message)) {
    return message.value;
  }
  if (Predicate.hasProperty(failure, "cause") && Predicate.isNotNullish(failure.cause)) {
    return messageOf(failure.cause);
  }
  return String(failure);
}

function tagOf(failure: unknown): string {
  const tag = Option.orElse(textProperty(failure, "_tag"), () => textProperty(failure, "name"));
  return Option.getOrElse(tag, () => "Defect");
}

function firstStackFrame(failure: unknown): string {
  const lines = Str.split(
    Option.getOrElse(textProperty(failure, "stack"), () => ""),
    "\n",
  );
  const frame = Arr.findFirst(lines, (line) => Str.startsWith("at ")(Str.trimStart(line)));
  return Option.match(frame, { onNone: () => "", onSome: (line) => ` (${Str.trim(line)})` });
}

function startFailureLine(cause: Cause.Cause<unknown>, redact: (text: string) => string): string {
  const failure = Cause.squash(cause);
  let line = `cookout serve failed to start: ${tagOf(failure)}: ${messageOf(failure)}`;
  if (!Cause.hasFails(cause)) {
    line += firstStackFrame(failure);
  }
  return redact(Str.replaceAll(lineBreaks, " ")(line));
}

function failedToStart(
  redact: (text: string) => string,
): <Failure>(cause: Cause.Cause<Failure>) => Effect.Effect<never, Failure | CommandFailed> {
  return (cause) => {
    const alreadyPrinted = Cause.hasInterruptsOnly(cause) || isCommandFailed(Cause.squash(cause));
    if (alreadyPrinted) {
      return Effect.failCause(cause);
    }
    return Console.error(startFailureLine(cause, redact)).pipe(Effect.andThen(serveFailed));
  };
}

const startOn = Effect.fnUntraced(function* startOnStorage(
  layers: ServeLayers,
  listen: Omit<Serving, "webFolder">,
  { path, served }: { readonly path: string; readonly served: ServedStorage },
) {
  const admin = yield* adminTokenOrRefuse;
  const name = yield* adminNameOrRefuse;
  const assets = yield* chosenAssetStore(path);
  const stores = Layer.merge(layers.storage(served.setting), assets);
  const server = cookoutServer({ ...listen, ...webFolderOf(layers), adminName: name, adminToken: admin });
  const services = yield* Layer.build(Layer.provide(server, stores).pipe(Layer.provide(triggerCallerLive))).pipe(
    Effect.catchTags({ AdminNameIsAgent: adminNameIsAgent, StorageUnavailable: storageUnavailable(served.redact) }),
  );
  const url = yield* serverUrl.pipe(Effect.provideContext(services));
  yield* printLine({ database: served.database, listening: url });
});

const runServer = (layers: ServeLayers, listen: Omit<Serving, "webFolder">, path: string) =>
  Effect.gen(function* () {
    const served = yield* servedStorage(path).pipe(Effect.catchCause(failedToStart(Function.identity)));
    const started = startOn(layers, listen, { path, served });
    yield* Effect.catchCause(started, failedToStart(served.redact));
  }).pipe(Effect.andThen(Effect.never), Effect.scoped);

export const serveCommand = (layers: ServeLayers) =>
  Command.make(
    "serve",
    {
      db: Flag.String("db").pipe(
        Flag.withFallbackConfig(databasePath),
        Flag.withDescription("The SQLite file (COOKOUT_DB), when DATABASE_URL is unset."),
      ),
      host: Flag.String("host").pipe(
        Flag.withFallbackConfig(host),
        Flag.withDescription("The address to listen on (COOKOUT_HOST)."),
      ),
      port: Flag.Int("port").pipe(Flag.withFallbackConfig(port), Flag.withDescription("The port to listen on (PORT).")),
      publicUrl: Flag.String("public-url").pipe(
        Flag.withFallbackConfig(publicUrl),
        Flag.withDescription("The address it is deployed at, whose host it also answers (COOKOUT_PUBLIC_URL)."),
      ),
    },
    (flags) => runServer(layers, { host: flags.host, port: flags.port, publicUrl: flags.publicUrl }, flags.db),
  ).pipe(Command.withDescription("Start the cookout server, on Postgres at DATABASE_URL or else SQLite."));

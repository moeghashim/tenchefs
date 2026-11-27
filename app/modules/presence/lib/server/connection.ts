import { AgentSessionSent, LoginCredentialSent } from "../../../identities/server.ts";
import { DateTime, Effect, Option, Predicate } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { Connection } from "./book.ts";
import type { LiveConnectionDetail } from "../../index.ts";
import { Storage } from "../../../storage/server.ts";
import { isoTimeOf } from "../../../time/server.ts";

interface OpenedStream {
  readonly caller: Identity;
  readonly authorization: string | undefined;
  readonly runner: boolean;
}

const WATCH: LiveConnectionDetail = { via: "watch" };
const WEB: LiveConnectionDetail = { via: "web" };

function runnerOf(runner: boolean): Connection["runner"] {
  if (runner) {
    return "asleep";
  }
  return "not a runner";
}

function joinedHost(identity: IdentityName): Effect.Effect<Option.Option<string>, never, Storage> {
  return Effect.gen(function* findJoinedHost() {
    const storage = yield* Storage;
    const moment = yield* DateTime.now;
    const session = yield* storage.findLiveAgentSession({ identity, now: isoTimeOf(moment) });
    return Option.flatMapNullishOr(session, ({ host }) => host);
  }).pipe(Effect.orElseSucceed(Option.none<string>));
}

const connectionOf = Effect.fnUntraced(function* detailOfConnection({
  authorization,
  caller,
  runner,
}: OpenedStream): Effect.fn.Return<Connection, never, Storage> {
  const loginCredential = yield* LoginCredentialSent;
  if (Predicate.isUndefined(authorization)) {
    return { detail: WEB, runner: "not a runner", sentWith: { kind: "web", loginCredential } };
  }
  const sent = yield* AgentSessionSent;
  if (Option.isNone(sent)) {
    return { detail: WATCH, runner: runnerOf(runner), sentWith: { kind: "identity token", loginCredential } };
  }
  const host = yield* joinedHost(caller.name);
  const detail = Option.match(host, {
    onNone: () => WATCH,
    onSome: (joinedFrom): LiveConnectionDetail => ({ host: joinedFrom, via: "watch" }),
  });
  return { detail, runner: runnerOf(runner), sentWith: { hash: sent.value, kind: "agent session" } };
});

export { connectionOf };

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
}

const WATCH: LiveConnectionDetail = { via: "watch" };
const WEB: LiveConnectionDetail = { via: "web" };

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
}: OpenedStream): Effect.fn.Return<Connection, never, Storage> {
  if (Predicate.isUndefined(authorization)) {
    const loginCredential = yield* LoginCredentialSent;
    return { detail: WEB, sentWith: { kind: "web", loginCredential } };
  }
  const sent = yield* AgentSessionSent;
  if (Option.isNone(sent)) {
    return { detail: WATCH, sentWith: { kind: "identity token" } };
  }
  const host = yield* joinedHost(caller.name);
  const detail = Option.match(host, {
    onNone: () => WATCH,
    onSome: (joinedFrom): LiveConnectionDetail => ({ host: joinedFrom, via: "watch" }),
  });
  return { detail, sentWith: { hash: sent.value, kind: "agent session" } };
});

export { connectionOf };

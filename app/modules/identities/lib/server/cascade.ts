import { Array as Arr, Effect } from "effect";
import { Caller, credentialsEnded, tokensEnded } from "./auth.ts";
import type { EndedCredential, StorageUnavailable } from "../../../storage/server.ts";
import type { IdentityChanges } from "./auth.ts";
import type { IdentityName } from "../../index.ts";
import { Storage } from "../../../storage/server.ts";
import { now } from "./login-support.ts";

function isOwnSession(name: IdentityName, { identity, kind }: EndedCredential): boolean {
  return identity === name && kind === "session";
}

export function endBelowRotated(
  name: IdentityName,
): Effect.Effect<void, StorageUnavailable, Caller | Storage | IdentityChanges> {
  return Effect.gen(function* endBelowRotatedToken() {
    const storage = yield* Storage;
    const caller = yield* Caller;
    const at = yield* now;
    const ended = yield* storage.revokeBelowRevokedTokens(name, at);
    const own = Arr.filter(ended, (each) => isOwnSession(name, each));
    const others = Arr.filter(ended, (each) => !isOwnSession(name, each));
    const loginCredentials = Arr.map(own, ({ hash }) => hash);
    yield* tokensEnded({
      by: caller.name,
      cause: "rotated",
      identity: name,
      tokens: { kind: "identity tokens", loginCredentials },
    });
    yield* credentialsEnded({ by: caller.name, ended: others });
  });
}

export function endBelowDeactivated(
  name: IdentityName,
): Effect.Effect<void, StorageUnavailable, Caller | Storage | IdentityChanges> {
  return Effect.gen(function* endBelowDeactivatedIdentity() {
    const storage = yield* Storage;
    const caller = yield* Caller;
    const at = yield* now;
    const ended = yield* storage.endCredentialsOf(name, at);
    yield* credentialsEnded({ by: caller.name, ended: Arr.filter(ended, ({ identity }) => identity !== name) });
  });
}

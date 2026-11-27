import { DateTime, Duration, Effect, Option } from "effect";
import { LoginCredentialSent } from "./auth.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import type { TokenHash } from "../../index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { loginEnded } from "./principals.ts";

const CHECK_SECONDS = 30;
const CHECK_EVERY = Duration.seconds(CHECK_SECONDS);

function untilLoginEnds(storage: Storage["Service"], hash: TokenHash): Effect.Effect<Refusal, StorageUnavailable> {
  const check = Effect.flatMap(DateTime.now, (now) => storage.checkLoginCredential({ hash, now: isoTimeOf(now) }));
  return Effect.delay(check, CHECK_EVERY).pipe(
    Effect.repeat({ until: (checked) => checked.status !== "active" }),
    Effect.map(({ status }) => loginEnded(status)),
  );
}

const sentLoginCredentialEnded: Effect.Effect<Refusal, StorageUnavailable, Storage> = Effect.gen(
  function* watchSentLoginCredential() {
    const storage = yield* Storage;
    const sent = yield* LoginCredentialSent;
    return yield* Option.match(sent, { onNone: () => Effect.never, onSome: (hash) => untilLoginEnds(storage, hash) });
  },
);

export { sentLoginCredentialEnded };

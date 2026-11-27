import type { AssetStore, LoginCredentialLookup, StorageUnavailable } from "../../../storage/server.ts";
import { DateTime, Effect, Layer, Ref } from "effect";
import type { IsoTime } from "../../../time/index.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { token } from "../../../identities/index.ts";

type Ages = ReadonlyMap<TokenHash, number>;

type Stores = Storage | AssetStore;

type UseLoginCredential = Parameters<Storage["Service"]["useLoginCredential"]>[number];

type Lookup = Effect.Effect<LoginCredentialLookup, StorageUnavailable>;

interface AgedLogins {
  readonly storage: Layer.Layer<Stores>;
  readonly ageLogin: (credential: string, days: number) => Effect.Effect<void>;
}

const NOT_AGED = 0;

function agedNow(ages: Ages, { hash, now }: UseLoginCredential): UseLoginCredential {
  const days = ages.get(hash) ?? NOT_AGED;
  const later: IsoTime = isoTimeOf(DateTime.add(DateTime.makeUnsafe(now), { days }));
  return { hash, now: later };
}

function agedBy(ages: Ages, hash: TokenHash, days: number): Ages {
  return new Map([...ages, [hash, (ages.get(hash) ?? NOT_AGED) + days]]);
}

function agedLoginsOn(stores: Layer.Layer<Stores>): Effect.Effect<AgedLogins, never, Secrets> {
  return Effect.gen(function* holdAges() {
    const secrets = yield* Secrets;
    const aged = yield* Ref.make<Ages>(new Map());
    function seen(use: UseLoginCredential): Effect.Effect<UseLoginCredential> {
      return Effect.map(Ref.get(aged), (ages) => agedNow(ages, use));
    }
    const agedStorage = Layer.effect(
      Storage,
      Effect.map(Storage, (storage) => ({
        ...storage,
        checkLoginCredential: (use: UseLoginCredential): Lookup =>
          Effect.flatMap(seen(use), storage.checkLoginCredential),
        useLoginCredential: (use: UseLoginCredential): Lookup => Effect.flatMap(seen(use), storage.useLoginCredential),
      })),
    );
    return {
      ageLogin: (credential: string, days: number) =>
        Effect.flatMap(secrets.hashToken(token(credential)), (hash) =>
          Ref.update(aged, (ages) => agedBy(ages, hash, days)),
        ),
      storage: Layer.merge(stores, Layer.provide(agedStorage, stores)),
    };
  });
}

export { type AgedLogins, agedLoginsOn };

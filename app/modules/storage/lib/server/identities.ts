import type { AgentIdentity, Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type {
  AvatarRemovalsSection,
  AvatarsToRemove,
  CreateRefusal,
  DeleteIdentityResult,
  IdentityDeletesSection,
} from "./identity-owners.ts";
import { Effect, Option, Predicate, Schema } from "effect";
import {
  IDENTITY_COLUMNS,
  IdentityRow,
  insertIdentity,
  revokeTokensOfName,
  setOnlyTokenOf,
  toIdentity,
} from "./identity-row.ts";
import {
  memoryAvatarRemovals,
  memoryCreateRefusal,
  memoryDeactivations,
  memoryRemoveIdentity,
  sqlAvatarRemovals,
  sqlCreateRefusal,
  sqlDeactivations,
  sqlIdentityDeletes,
} from "./identity-owners.ts";
import { memoryDisplayNames, sqlDisplayNames } from "./display-names.ts";
import { memorySetAdmin, memoryTransfers, sqlSetAdmin, sqlTransfers } from "./identity-admins.ts";
import type { DisplayNamesSection } from "./display-names.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { MemoryState } from "./memory-state.ts";
import type { PlaceHandler } from "./commands.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

export type TokenLookup =
  | { readonly status: "active"; readonly identity: Identity }
  | { readonly status: "revoked" }
  | { readonly status: "unknown" };

type ReplaceTokenResult =
  | { readonly status: "replaced"; readonly identity: Identity }
  | { readonly status: "not_found" };

export type IdentitiesSection = DisplayNamesSection &
  IdentityDeletesSection &
  AvatarRemovalsSection &
  ReturnType<typeof sqlTransfers> &
  ReturnType<typeof sqlDeactivations> & {
    readonly createIdentity: (identity: Identity, hash: TokenHash) => Fails<"created" | CreateRefusal>;
    readonly setOnlyToken: (identity: Identity, hash: TokenHash) => Fails<void>;
    readonly listIdentities: () => Fails<readonly Identity[]>;
    readonly findIdentityByTokenHash: (hash: TokenHash) => Fails<TokenLookup>;
    readonly findIdentityByName: (name: IdentityName) => Fails<Identity | undefined>;
    readonly replaceToken: (name: IdentityName, hash: TokenHash) => Fails<ReplaceTokenResult>;
    readonly setAdmin: ReturnType<typeof sqlSetAdmin>;
  };

type MemoryIdentities = {
  readonly identities: Map<IdentityName, Identity>;
  readonly activeTokens: Map<TokenHash, IdentityName>;
  readonly revokedTokens: Map<TokenHash, IdentityName>;
  readonly avatarsToRemove: AvatarsToRemove;
};

const byName = (a: Identity, b: Identity) => (a.name < b.name ? -1 : 1);

const revokeTokensOf = (data: MemoryIdentities, name: IdentityName) => {
  for (const [hash, holder] of data.activeTokens) {
    if (holder === name) {
      data.activeTokens.delete(hash);
      data.revokedTokens.set(hash, holder);
    }
  }
};

function createIn(data: MemoryIdentities, identity: Identity, hash: TokenHash): "created" | CreateRefusal {
  const refusal = memoryCreateRefusal(data.identities)(identity);
  if (Option.isSome(refusal)) {
    return refusal.value;
  }
  data.identities.set(identity.name, { ...identity });
  data.activeTokens.set(hash, identity.name);
  return "created";
}

function setOnlyTokenIn(data: MemoryIdentities, identity: Identity, hash: TokenHash): void {
  if (!data.identities.has(identity.name)) {
    data.identities.set(identity.name, { ...identity });
  }
  revokeTokensOf(data, identity.name);
  data.revokedTokens.delete(hash);
  data.activeTokens.set(hash, identity.name);
}

const lookUp = (data: MemoryIdentities, hash: TokenHash): TokenLookup => {
  const name = data.activeTokens.get(hash);
  const identity = name === undefined ? undefined : data.identities.get(name);
  if (identity !== undefined) {
    return { identity: { ...identity }, status: "active" };
  }
  return data.revokedTokens.has(hash) ? { status: "revoked" } : { status: "unknown" };
};

function placeHandlerIn(data: MemoryIdentities): PlaceHandler {
  return (handler: AgentIdentity) => {
    const found = data.identities.get(handler.name);
    if (Predicate.isUndefined(found)) {
      data.identities.set(handler.name, { ...handler });
      return "placed";
    }
    if (found.kind === "human") {
      return "human";
    }
    return "placed";
  };
}

interface MemoryIdentitiesSection extends Omit<IdentitiesSection, keyof IdentityDeletesSection> {
  readonly placeHandler: PlaceHandler;
  readonly findIdentity: FindIdentity;
  readonly tokenRevoked: (hash: TokenHash) => boolean;
  readonly removeIdentity: (name: IdentityName, messages: number) => Fails<DeleteIdentityResult>;
}

export const memoryIdentities = (state: MemoryState): MemoryIdentitiesSection => {
  const data: MemoryIdentities = {
    activeTokens: new Map(),
    avatarsToRemove: new Set(),
    identities: new Map(),
    revokedTokens: new Map(),
  };
  state.lineage.useTokens(data);
  const open = <A>(work: () => A): Fails<A> => Effect.andThen(state.ensureOpen, Effect.sync(work));
  const deactivations = memoryDeactivations({
    holdToken: (name, hash) => {
      data.activeTokens.set(hash, name);
    },
    identities: data.identities,
    revokeTokensOf: (name) => {
      revokeTokensOf(data, name);
    },
  });
  const remove = memoryRemoveIdentity(data);
  return {
    ...memoryAvatarRemovals({ avatarsToRemove: data.avatarsToRemove, open }),
    createIdentity: (identity, hash) => open(() => createIn(data, identity, hash)),
    deactivateIdentity: (name) => open(() => deactivations.deactivate(name)),
    findIdentity: (name) => data.identities.get(name),
    findIdentityByName: (name) => open(() => data.identities.get(name)),
    findIdentityByTokenHash: (hash) => open(() => lookUp(data, hash)),
    listIdentities: () => open(() => [...data.identities.values()].sort(byName).map((found) => ({ ...found }))),
    ...memoryDisplayNames({ identities: data.identities, open }),
    ...memoryTransfers({ identities: data.identities, open }),
    placeHandler: placeHandlerIn(data),
    reactivateIdentity: (name, hash) => open(() => deactivations.reactivate(name, hash)),
    removeIdentity: (name, messages) => open(() => remove(name, messages)),
    replaceToken: (name, hash) =>
      open((): ReplaceTokenResult => {
        const identity = data.identities.get(name);
        if (identity === undefined) {
          return { status: "not_found" };
        }
        revokeTokensOf(data, name);
        data.activeTokens.set(hash, name);
        return { identity: { ...identity }, status: "replaced" };
      }),
    setAdmin: (name, admin) => open(() => memorySetAdmin(data.identities)(name, admin)),
    setOnlyToken: (identity, hash) =>
      open(() => {
        setOnlyTokenIn(data, identity, hash);
      }),
    tokenRevoked: (hash) => data.revokedTokens.has(hash),
  };
};

const TokenRow = Schema.Struct({ name: Schema.NullOr(Schema.String), revoked: Schema.Literals([0, 1]) });

const decode =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (row: unknown): Fails<S["Type"]> =>
    Schema.decodeUnknownEffect(schema)(row).pipe(Effect.mapError(unreadable));

const toLookup = (row: unknown): Fails<TokenLookup> =>
  row === undefined
    ? Effect.succeed({ status: "unknown" })
    : Effect.flatMap(
        decode(TokenRow)(row),
        (token): Fails<TokenLookup> =>
          token.revoked === 1 || token.name === null
            ? Effect.succeed({ status: "revoked" })
            : Effect.map(decode(IdentityRow)(row), (identity) => ({
                identity: toIdentity(identity),
                status: "active",
              })),
      );

export const sqlIdentities = (db: SqlDatabase): IdentitiesSection => {
  const find = (name: IdentityName) =>
    db
      .get(`SELECT ${IDENTITY_COLUMNS} FROM identities WHERE name = ?`, name)
      .pipe(Effect.flatMap((row) => (row === undefined ? Effect.succeed(undefined) : decode(IdentityRow)(row))));
  const revokeTokensOfIdentity = revokeTokensOfName(db);
  return {
    createIdentity: (identity, hash) =>
      db.transaction(
        Effect.gen(function* () {
          const refusal = yield* sqlCreateRefusal(db)(identity);
          if (Option.isSome(refusal)) {
            return refusal.value;
          }
          yield* insertIdentity(db)(identity, hash);
          return "created" as const;
        }),
      ),
    ...sqlDeactivations(db),
    ...sqlIdentityDeletes(db),
    ...sqlAvatarRemovals(db),
    findIdentityByName: (name) =>
      Effect.map(find(name), (row) => Option.getOrUndefined(Option.map(Option.fromUndefinedOr(row), toIdentity))),
    findIdentityByTokenHash: (hash) =>
      db
        .get(
          `SELECT tokens.revoked, identities.*
           FROM tokens LEFT JOIN identities ON identities.name = tokens.identity_name
           WHERE tokens.token_hash = ?`,
          hash,
        )
        .pipe(Effect.flatMap(toLookup)),
    listIdentities: () =>
      db
        .all(`SELECT ${IDENTITY_COLUMNS} FROM identities ORDER BY name`)
        .pipe(Effect.flatMap(Effect.forEach((row) => Effect.map(decode(IdentityRow)(row), toIdentity)))),
    replaceToken: (name, hash) =>
      db.transaction(
        Effect.gen(function* () {
          const row = yield* find(name);
          if (row === undefined) {
            return { status: "not_found" } as const;
          }
          yield* revokeTokensOfIdentity(name);
          yield* db.run("INSERT INTO tokens (token_hash, identity_name, revoked) VALUES (?, ?, FALSE)", hash, name);
          return { identity: toIdentity(row), status: "replaced" } as const;
        }),
      ),
    setAdmin: sqlSetAdmin(db),
    setOnlyToken: (identity, hash) => db.transaction(setOnlyTokenOf(db)(identity, hash)),
    ...sqlDisplayNames(db),
    ...sqlTransfers(db),
  };
};

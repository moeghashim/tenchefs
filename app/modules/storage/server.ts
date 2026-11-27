/**
 * The cookout's storage: one `Storage` service, so operations that must be
 * atomic stay one method each, and Layers that pass the same contract
 * suite. Every method fails with `StorageUnavailable` when the store can't be used.
 */
import { Array as Arr, Context, Effect, Layer, Redacted, String as Str } from "effect";
import type { FileSystem } from "effect";
import type { FullStorage } from "./lib/server/memory-store.ts";
import type { SecretsCipher } from "../secrets/server.ts";
import type { SecretsKeyMismatch } from "./lib/server/sealed-secrets.ts";
import type { StorageUnavailable } from "./lib/server/errors.ts";
import { keyMismatch } from "./lib/server/sealed-secrets.ts";
import { openMemoryStore } from "./lib/server/memory-store.ts";
import { openPostgresStore } from "./lib/server/postgres-store.ts";
import { openSqliteStore } from "./lib/server/sqlite-store.ts";
import { postgresQueryPlans as planPostgresQueries } from "./lib/server/query-plans-postgres.ts";
import { sqliteQueryPlans as planSqliteQueries } from "./lib/server/query-plans-sqlite.ts";

export { StorageUnavailable } from "./lib/server/errors.ts";

/**
 * The asset store: an attachment's or an avatar's bytes, put, read and removed by its ID only, beside
 * `Storage`, which holds each one's metadata. Callers never see a path. `diskAssetStore` keeps each asset as one file
 * named by its ID, written to a partial file first and renamed into place, so a crash never leaves half a file under an ID;
 * `memoryAssetStore` holds them in this process only.
 */
export { AssetStore, diskAssetStore, memoryAssetStore } from "./lib/server/asset-store.ts";

/**
 * The S3-compatible asset store (S3, R2 or Tigris): one private object per asset, keyed by its ID alone, in the
 * bucket `S3Bucket` names, each request signed with its credentials.
 */
export { s3AssetStore } from "./lib/server/asset-store-s3.ts";
export type { S3Bucket } from "./lib/server/asset-store-s3.ts";
export type { QueryPlan } from "./lib/server/query-plans-sqlite.ts";
export type { TokenLookup } from "./lib/server/identities.ts";
export type { SetAdminResult } from "./lib/server/identity-admins.ts";
export type { DeactivateIdentityResult, ReactivateIdentityResult } from "./lib/server/identity-deactivations.ts";
export type { DeleteIdentityResult } from "./lib/server/identity-deletes.ts";
export type { StoredWebhookCommand } from "./lib/server/commands.ts";
export type { DeletedChannel } from "./lib/server/channels.ts";
export type { WebhookCommandTokenGrant } from "./lib/server/command-tokens.ts";
export type { DeliveryOutcome, StoredDelivery } from "./lib/server/deliveries.ts";
export type { NewMessage, ReplyTarget, StoredPage, StoredThread } from "./lib/server/messages.ts";
export type { OpenThreadsPageRequest } from "./lib/server/open-threads.ts";
export type { SearchPageRequest, SearchQuery } from "./lib/server/search.ts";
export type { AckedMessage } from "./lib/server/inbox.ts";
export { mentionsOwnAuthor } from "./lib/server/inbox.ts";
export type { StoredNudge } from "./lib/server/nudges.ts";
export type {
  ScheduledRun,
  StoredScheduledMessage,
} from "./lib/server/scheduled-messages.ts";
export type { OfferChanges, StoredDeactivationOffer } from "./lib/server/deactivation-offers.ts";
export type { StoredDeactivatedQuietAgent } from "./lib/server/deactivated-quiet-agents.ts";
export type { StoredPresence } from "./lib/server/presence.ts";
export type { StoredTrigger } from "./lib/server/triggers.ts";
export type { NewWebhookCommandCall } from "./lib/server/command-calls.ts";
export type { JoinCodeRedemption } from "./lib/server/join-codes.ts";
export type { AgentAt, StoredAgentSession, UseAgentSessionResult } from "./lib/server/agent-sessions.ts";
export type { TransferAgentResult } from "./lib/server/identity-admins.ts";
/**
 * Where a Login request or agent join request was started from, recorded when it starts (#905): the client's IP
 * address and the User-Agent it sent. A request stored before they were recorded has neither.
 */
export type { RequestOrigin } from "./lib/server/request-origins.ts";
export type {
  LoginCollection,
  LoginCredentialLookup,
  LoginRequest,
  LoginRequestKind,
  NewLoginRequest,
} from "./lib/server/login-requests.ts";
export type { EndedCredential } from "./lib/server/credential-lineage.ts";
export type {
  AgentJoinApproval,
  AgentJoinCollection,
  AgentJoinRequest,
  PendingAgentJoinRequest,
} from "./lib/server/agent-join-requests.ts";

export class Storage extends Context.Service<Storage, FullStorage>()("@ai-hero/cookout/storage/server/Storage") {}

/**
 * Opens and migrates the SQLite file at `path`, and closes it when the Layer
 * is released. A new file is created readable by its owner only, and so are
 * its WAL and shared-memory files, since they hold token hashes and messages.
 * Trigger tokens, trigger header values and Webhook command secrets are sealed with `cipher` before they are written
 * and opened as they are read (ADR 0150).
 * @param opening The SQLite file, created if missing, and the cipher made from `COOKOUT_SECRETS_KEY`.
 * @returns The store, failing with `StorageUnavailable` if it can't be opened.
 */
export function sqliteStorage(opening: {
  readonly path: string;
  readonly cipher: SecretsCipher;
}): Layer.Layer<Storage, StorageUnavailable, FileSystem.FileSystem> {
  return Layer.effect(Storage, openSqliteStore(opening));
}

/**
 * Runs `work` on a SQLite store at `path`, then returns SQLite's query plan
 * for each distinct statement the store ran, so a test can check a query
 * still uses its index.
 * @param planning The SQLite file, created if missing, and what to do with its store.
 * @returns Each statement with the `detail` lines of its `EXPLAIN QUERY PLAN`.
 */
export function sqliteQueryPlans<Failure>(planning: {
  readonly cipher: SecretsCipher;
  readonly path: string;
  readonly work: (storage: Storage["Service"]) => Effect.Effect<unknown, Failure>;
}): ReturnType<typeof planSqliteQueries<Failure>> {
  return planSqliteQueries(planning);
}

/**
 * Runs `work` on a Postgres store at `url`, then returns Postgres's generic
 * query plan for each distinct statement the store ran, so a test can check
 * a query still uses its index.
 * @param planning The Postgres database, migrated if it isn't, and what to do with its store.
 * @returns Each statement with the lines of its `EXPLAIN (GENERIC_PLAN)`.
 */
export function postgresQueryPlans<Failure>(planning: {
  readonly cipher: SecretsCipher;
  readonly url: Redacted.Redacted;
  readonly work: (storage: Storage["Service"]) => Effect.Effect<unknown, Failure>;
}): ReturnType<typeof planPostgresQueries<Failure>> {
  return planPostgresQueries(planning);
}

/**
 * Opens and migrates the Postgres database at `url` on a pool of eight
 * connections, and closes the pool when the Layer is released. TLS is used
 * when the URL asks for it (`sslmode=require`). Each transaction is
 * serializable and runs one at a time; one that loses a serialization or
 * deadlock conflict is retried with jittered backoff, and surfaces
 * `StorageUnavailable` once the retries run out, so its work must read no
 * clock and publish nothing. Migrations are Postgres's own list, applied
 * in order under an advisory lock so two processes starting together apply
 * each once; a database newer than the list fails with "Upgrade cookout".
 * Every section is on Postgres, search included (a GIN index over each
 * message's words). `cookout serve` opens it when `DATABASE_URL` is set.
 * Secrets are sealed with `cipher`, as in `sqliteStorage`.
 * @param opening The database URL, kept redacted, and the cipher made from `COOKOUT_SECRETS_KEY`.
 * @returns The store, failing with `StorageUnavailable` if it can't be opened.
 */
export function postgresStorage(opening: {
  readonly url: Redacted.Redacted;
  readonly cipher: SecretsCipher;
}): Layer.Layer<Storage, StorageUnavailable> {
  return Layer.effect(Storage, openPostgresStore(opening));
}

/**
 * A store held in this process only. Everything is lost when the Layer is released. It keeps nothing at rest, so it
 * seals no secrets.
 */
export const memoryStorage: Layer.Layer<Storage> = Layer.effect(Storage, openMemoryStore);

/**
 * Which store `cookout serve` keeps its data in: the Postgres database at a URL, kept redacted, or else the SQLite
 * file at a path.
 */
export type StorageSetting =
  | { readonly store: "postgres"; readonly url: Redacted.Redacted }
  | { readonly store: "sqlite"; readonly path: string };

/**
 * Chooses the store from the settings: Postgres when the URL is set, since it wins over the path, so a board can
 * keep its SQLite file in place while it runs on Postgres; otherwise SQLite at the path.
 * @param settings The SQLite path (`COOKOUT_DB`) and the database URL (`DATABASE_URL`), empty when unset.
 * @param settings.path The SQLite path.
 * @param settings.url The database URL, empty when unset.
 * @returns The storage setting.
 */
export function storageSetting({
  path,
  url,
}: {
  readonly path: string;
  readonly url: Redacted.Redacted;
}): StorageSetting {
  if (Str.isEmpty(Redacted.value(url))) {
    return { path, store: "sqlite" };
  }
  return { store: "postgres", url };
}

/** A storage setting with the cipher made from `COOKOUT_SECRETS_KEY`, which opens a store. */
export interface StorageOpening {
  readonly setting: StorageSetting;
  readonly cipher: SecretsCipher;
}

/**
 * Opens the store a storage setting names, `postgresStorage` or `sqliteStorage`.
 * @param opening The storage setting and the cipher made from `COOKOUT_SECRETS_KEY`.
 * @param opening.cipher The cipher made from `COOKOUT_SECRETS_KEY`.
 * @param opening.setting The storage setting.
 * @returns The store, failing with `StorageUnavailable` if it can't be opened.
 */
export function storageLayer({
  cipher,
  setting,
}: StorageOpening): Layer.Layer<Storage, StorageUnavailable, FileSystem.FileSystem> {
  if (setting.store === "postgres") {
    return postgresStorage({ cipher, url: setting.url });
  }
  return sqliteStorage({ cipher, path: setting.path });
}

/** The store's secrets were sealed with another `COOKOUT_SECRETS_KEY` than this one, so the server does not start. */
export { SecretsKeyMismatch } from "./lib/server/sealed-secrets.ts";

/**
 * Seals the store's secrets when it is built (ADR 0150). The first boot with `COOKOUT_SECRETS_KEY` seals every trigger
 * token, trigger header value and Webhook command secret stored in plaintext before, and records which key sealed
 * them, in one transaction. A later boot with the same key changes nothing; one with another key fails with
 * `SecretsKeyMismatch`, since the store's secrets can't be opened with it.
 */
export const secretsSealed: Layer.Layer<never, StorageUnavailable | SecretsKeyMismatch, Storage> = Layer.effectDiscard(
  Effect.flatMap(Storage, (storage) =>
    Effect.filterOrFail(
      storage.sealSecrets,
      (sealed) => sealed !== "other_key",
      () => keyMismatch,
    ),
  ),
);

/**
 * The store as it may be shown, in a startup line or a log: the SQLite path, or the Postgres database as
 * `postgres://<host>/<database name>`, without its user, password or parameters.
 * @param setting The storage setting.
 * @returns The path, or the URL with only its host and database.
 */
export function shownDatabase(setting: StorageSetting): string {
  if (setting.store === "sqlite") {
    return setting.path;
  }
  const { host, pathname } = new URL(Redacted.value(setting.url));
  return `postgres://${host}${pathname}`;
}

/**
 * Takes the database URL out of a text, such as a client's error message, that may quote it: the URL becomes its
 * shown form and its password, wherever else it appears, `<redacted>`.
 * @param setting The storage setting.
 * @returns The text without the URL's password. A SQLite setting leaves it as it is.
 */
export function withoutDatabaseSecret(setting: StorageSetting): (text: string) => string {
  if (setting.store === "sqlite") {
    return (text) => text;
  }
  const url = Redacted.value(setting.url);
  const { password } = new URL(url);
  const secrets = Arr.filter([password, decodeURIComponent(password)], Str.isNonEmpty);
  const shown = shownDatabase(setting);
  return (text) =>
    Arr.reduce(secrets, Str.replaceAll(url, shown)(text), (redacted, secret) =>
      Str.replaceAll(secret, "<redacted>")(redacted),
    );
}

import { Array as Arr, Effect, Option } from "effect";
import {
  POSTGRES_ATTACHMENTS_MIGRATION,
  POSTGRES_SEARCH_MIGRATION,
  POSTGRES_TRIGGERS_MIGRATION,
} from "./feature-migrations.ts";
import { POSTGRES_SCHEDULED_MESSAGES_MIGRATION } from "./scheduled-messages-sqlite.ts";
import type { PostgresDatabase } from "./adapters/postgres.ts";
import { StorageUnavailable } from "./errors.ts";
import { currentVersion } from "./postgres-schema-version.ts";

const postgresMigrations: readonly (readonly string[])[] = [
  [
    `CREATE TABLE message_id_sequence (
       only_row integer PRIMARY KEY CHECK (only_row = 1),
       last_id bigint NOT NULL,
       latest_created_at text COLLATE "C"
     )`,
    "INSERT INTO message_id_sequence (only_row, last_id) VALUES (1, 0)",
    `CREATE TABLE identities (
       name text COLLATE "C" PRIMARY KEY,
       owner text COLLATE "C",
       admin boolean NOT NULL,
       created_at text COLLATE "C" NOT NULL,
       kind text COLLATE "C" NOT NULL DEFAULT 'agent'
         CHECK ((kind = 'human' AND owner IS NULL) OR (kind = 'agent' AND owner IS NOT NULL)),
       display_name text COLLATE "C",
       deactivated boolean NOT NULL DEFAULT FALSE,
       description text COLLATE "C"
     )`,
    `CREATE FUNCTION identity_keeps_its_kind() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION 'An identity keeps its kind.';
     END
     $$`,
    `CREATE TRIGGER identity_kind_never_changes BEFORE UPDATE OF kind ON identities
     FOR EACH ROW WHEN (NEW.kind IS DISTINCT FROM OLD.kind) EXECUTE FUNCTION identity_keeps_its_kind()`,
    `CREATE TABLE tokens (
       token_hash text COLLATE "C" PRIMARY KEY,
       identity_name text COLLATE "C" NOT NULL,
       revoked boolean NOT NULL
     )`,
    "CREATE INDEX tokens_by_identity ON tokens (identity_name) WHERE NOT revoked",
    `CREATE TABLE channels (
       name text COLLATE "C" PRIMARY KEY,
       description text COLLATE "C",
       created_at text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE messages (
       id bigint PRIMARY KEY,
       channel text COLLATE "C" NOT NULL REFERENCES channels (name),
       author_name text COLLATE "C" NOT NULL,
       author_owner text COLLATE "C",
       text text COLLATE "C" NOT NULL,
       data jsonb,
       reply_to bigint REFERENCES messages (id),
       mentions jsonb NOT NULL,
       created_at text COLLATE "C" NOT NULL,
       harness text COLLATE "C",
       reopened_at text COLLATE "C",
       closed_at text COLLATE "C",
       closed_by text COLLATE "C"
     )`,
    "CREATE INDEX top_level_messages_by_channel ON messages (channel, id) WHERE reply_to IS NULL",
    "CREATE INDEX replies_by_thread ON messages (reply_to, id) WHERE reply_to IS NOT NULL",
    `CREATE TABLE message_mentions (
       identity_name text COLLATE "C" NOT NULL,
       message_id bigint NOT NULL REFERENCES messages (id),
       PRIMARY KEY (identity_name, message_id)
     )`,
    `CREATE TABLE follows (
       identity_name text COLLATE "C" NOT NULL,
       thread_id bigint NOT NULL REFERENCES messages (id),
       PRIMARY KEY (identity_name, thread_id)
     )`,
    `CREATE TABLE subscriptions (
       identity_name text COLLATE "C" NOT NULL,
       channel text COLLATE "C" NOT NULL REFERENCES channels (name),
       PRIMARY KEY (identity_name, channel)
     )`,
    `CREATE TABLE channel_read_positions (
       identity_name text COLLATE "C" NOT NULL,
       channel text COLLATE "C" NOT NULL REFERENCES channels (name),
       message_id bigint NOT NULL,
       PRIMARY KEY (identity_name, channel)
     )`,
    `CREATE TABLE thread_read_positions (
       identity_name text COLLATE "C" NOT NULL,
       thread_id bigint NOT NULL REFERENCES messages (id),
       message_id bigint NOT NULL,
       PRIMARY KEY (identity_name, thread_id)
     )`,
    `CREATE TABLE commands (
       name text COLLATE "C" PRIMARY KEY,
       url text COLLATE "C" NOT NULL,
       schema jsonb NOT NULL,
       description text COLLATE "C",
       handler_name text COLLATE "C" NOT NULL,
       secret text COLLATE "C" NOT NULL,
       created_at text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE command_tokens (
       hash text COLLATE "C" PRIMARY KEY,
       handler_name text COLLATE "C" NOT NULL,
       thread_id bigint NOT NULL REFERENCES messages (id),
       expires_at text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE deliveries (
       call_id text COLLATE "C" PRIMARY KEY,
       command text COLLATE "C" NOT NULL REFERENCES commands (name),
       channel text COLLATE "C" NOT NULL,
       thread_id bigint NOT NULL REFERENCES messages (id),
       data jsonb NOT NULL,
       attempts integer NOT NULL CHECK (attempts >= 0),
       next_attempt_at text COLLATE "C" NOT NULL,
       outcome text COLLATE "C" NOT NULL CHECK (outcome IN ('pending', 'delivered', 'failed'))
     )`,
    "CREATE INDEX deliveries_pending ON deliveries (outcome) WHERE outcome = 'pending'",
    `CREATE TABLE agent_session_tokens (
       hash text COLLATE "C" PRIMARY KEY,
       identity_name text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       issued_at text COLLATE "C" NOT NULL,
       expires_at text COLLATE "C" NOT NULL,
       idle_seconds integer NOT NULL CHECK (idle_seconds > 0),
       revoked boolean NOT NULL,
       last_used_at text COLLATE "C",
       host text COLLATE "C"
     )`,
    "CREATE INDEX agent_session_tokens_by_identity ON agent_session_tokens (identity_name)",
    `CREATE TABLE login_requests (
       request_hash text COLLATE "C" PRIMARY KEY,
       user_code text COLLATE "C" NOT NULL UNIQUE,
       host text COLLATE "C" NOT NULL,
       created_at text COLLATE "C" NOT NULL,
       expires_at text COLLATE "C" NOT NULL,
       approved_by text COLLATE "C"
     )`,
    `CREATE TABLE login_credentials (
       hash text COLLATE "C" PRIMARY KEY,
       identity_name text COLLATE "C" NOT NULL,
       host text COLLATE "C" NOT NULL,
       created_at text COLLATE "C" NOT NULL
     )`,
    "CREATE INDEX login_credentials_by_identity ON login_credentials (identity_name)",
    `CREATE TABLE agent_join_requests (
       request_hash text COLLATE "C" PRIMARY KEY,
       user_code text COLLATE "C" NOT NULL UNIQUE,
       agent text COLLATE "C" NOT NULL,
       host text COLLATE "C" NOT NULL,
       idle_expiry text COLLATE "C",
       created_at text COLLATE "C" NOT NULL,
       expires_at text COLLATE "C" NOT NULL,
       joins text COLLATE "C",
       created boolean,
       idle_seconds integer CHECK (idle_seconds > 0),
       force boolean
     )`,
    `CREATE TABLE read_receipts (
       message_id bigint NOT NULL REFERENCES messages (id),
       identity_name text COLLATE "C" NOT NULL,
       seen_at text COLLATE "C",
       PRIMARY KEY (message_id, identity_name)
     )`,
    `CREATE TABLE presence (
       identity_name text COLLATE "C" PRIMARY KEY REFERENCES identities (name) ON DELETE CASCADE,
       online boolean NOT NULL,
       last_seen_at text COLLATE "C" NOT NULL,
       offline_reason text COLLATE "C",
       ended_unexpectedly boolean
     )`,
    `CREATE TABLE reactions (
       message_id bigint NOT NULL REFERENCES messages (id),
       identity_name text COLLATE "C" NOT NULL,
       reaction text COLLATE "C" NOT NULL,
       reacted_at text COLLATE "C" NOT NULL,
       seen boolean NOT NULL,
       PRIMARY KEY (message_id, identity_name, reaction)
     )`,
    "CREATE INDEX unseen_reactions ON reactions (message_id) WHERE NOT seen",
    `CREATE TABLE join_codes (
       code_hash text COLLATE "C" PRIMARY KEY,
       agent text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       created_at text COLLATE "C" NOT NULL,
       expires_at text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE offline_alerts (
       id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       agent_name text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       owner_name text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       offline_reason text COLLATE "C" NOT NULL,
       raised_at text COLLATE "C" NOT NULL,
       read boolean NOT NULL,
       back_online_at text COLLATE "C"
     )`,
    "CREATE INDEX offline_alerts_by_owner ON offline_alerts (owner_name, id)",
    `CREATE TABLE nudges (
       id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       thread bigint NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
       recipient text COLLATE "C" REFERENCES identities (name) ON DELETE CASCADE,
       kind text COLLATE "C" NOT NULL CHECK (kind IN ('first', 'second')),
       raised_at text COLLATE "C" NOT NULL,
       read boolean NOT NULL
     )`,
    "CREATE INDEX nudges_by_recipient ON nudges (recipient, id)",
    "CREATE INDEX nudges_by_thread ON nudges (thread, id)",
    `CREATE TABLE nudges_since (
       id integer PRIMARY KEY CHECK (id = 1),
       since text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE activity (
       identity_name text COLLATE "C" PRIMARY KEY,
       last_activity_at text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE activity_since (
       id integer PRIMARY KEY CHECK (id = 1),
       since text COLLATE "C" NOT NULL
     )`,
    `CREATE TABLE deactivation_offers (
       id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       identity_name text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       recipients jsonb NOT NULL,
       raised_at text COLLATE "C" NOT NULL,
       quiet_days integer NOT NULL CHECK (quiet_days > 0),
       cleared boolean NOT NULL
     )`,
    `CREATE TABLE deactivated_quiet_agents (
       id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       identity_name text COLLATE "C" NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
       recipients jsonb NOT NULL,
       deactivated_at text COLLATE "C" NOT NULL,
       read boolean NOT NULL
     )`,
  ],
  ["ALTER TABLE deliveries ADD COLUMN added_order bigint GENERATED ALWAYS AS IDENTITY"],
  [
    `ALTER TABLE identities
       ADD COLUMN brought_in_by text COLLATE "C" REFERENCES identities (name) ON DELETE SET NULL`,
  ],
  POSTGRES_SEARCH_MIGRATION,
  POSTGRES_ATTACHMENTS_MIGRATION,
  POSTGRES_SCHEDULED_MESSAGES_MIGRATION,
  POSTGRES_TRIGGERS_MIGRATION,
];

const NEXT_VERSION = 1;

function tooNew(current: number): StorageUnavailable {
  return StorageUnavailable.make({
    message: `The database is at schema version ${current}, newer than this cookout (${postgresMigrations.length}). Upgrade cookout.`,
  });
}

function applyNext(db: PostgresDatabase): Effect.Effect<boolean, StorageUnavailable> {
  return db.migrating(
    Effect.gen(function* applyNextMigration() {
      const version = yield* currentVersion(db);
      if (version > postgresMigrations.length) {
        return yield* tooNew(version);
      }
      return yield* Option.match(Arr.get(postgresMigrations, version), {
        onNone: () => Effect.succeed(false),
        onSome: (statements) =>
          Effect.as(
            Effect.andThen(
              Effect.forEach(statements, (statement) => db.exec(statement), { concurrency: 1, discard: true }),
              db.run("UPDATE schema_version SET version = ?", version + NEXT_VERSION),
            ),
            true,
          ),
      });
    }),
  );
}

function migratePostgres(db: PostgresDatabase): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(applyNext(db), (applied) =>
    Effect.asVoid(Effect.when(migratePostgres(db), Effect.succeed(applied))),
  );
}

export { migratePostgres };

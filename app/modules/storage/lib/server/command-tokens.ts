import { AgentRow, toIdentity } from "./identity-row.ts";
import { Effect, Option, Schema, pipe } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isMessageId } from "../../../messages/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredWebhookCommandToken {
  readonly hash: TokenHash;
  readonly handler: IdentityName;
  readonly threadId: MessageId;
  readonly expiresAt: IsoTime;
}

interface WebhookCommandTokenGrant {
  readonly handler: Identity;
  readonly threadId: MessageId;
  readonly expiresAt: IsoTime;
}

interface WebhookCommandTokensSection {
  readonly addWebhookCommandToken: (stored: StoredWebhookCommandToken) => Fails<void>;
  readonly findWebhookCommandToken: (hash: TokenHash) => Fails<WebhookCommandTokenGrant | undefined>;
}

interface MemoryWebhookCommandTokensOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
}

type MemoryWebhookCommandTokensSection = WebhookCommandTokensSection & {
  readonly dropWebhookCommandTokens: (threadIds: ReadonlySet<MessageId>) => void;
  readonly dropWebhookCommandTokensOf: (handler: IdentityName) => void;
};

function memoryWebhookCommandTokens({
  findIdentity,
  state,
}: MemoryWebhookCommandTokensOptions): MemoryWebhookCommandTokensSection {
  const tokens = new Map<TokenHash, StoredWebhookCommandToken>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function grantOf({
    expiresAt,
    handler,
    threadId,
  }: StoredWebhookCommandToken): Option.Option<WebhookCommandTokenGrant> {
    return Option.map(Option.fromUndefinedOr(findIdentity(handler)), (found) => ({
      expiresAt,
      handler: { ...found },
      threadId,
    }));
  }
  function find(hash: TokenHash): WebhookCommandTokenGrant | undefined {
    return pipe(Option.fromUndefinedOr(tokens.get(hash)), Option.flatMap(grantOf), Option.getOrUndefined);
  }
  return {
    addWebhookCommandToken: (stored) =>
      open(() => {
        tokens.set(stored.hash, { ...stored });
      }),
    dropWebhookCommandTokens: (threadIds) => {
      for (const [hash, stored] of tokens) {
        if (threadIds.has(stored.threadId)) {
          tokens.delete(hash);
        }
      }
    },
    dropWebhookCommandTokensOf: (handler) => {
      for (const [hash, stored] of tokens) {
        if (stored.handler === handler) {
          tokens.delete(hash);
        }
      }
    },
    findWebhookCommandToken: (hash) => open(() => find(hash)),
  };
}

const ThreadIdColumn = Schema.Int.pipe(Schema.refine(isMessageId));

const GrantRow = Schema.Struct({ ...AgentRow.fields, expires_at: IsoTimeSchema, thread_id: ThreadIdColumn });

function grantFrom(row: typeof GrantRow.Type): WebhookCommandTokenGrant {
  return { expiresAt: row.expires_at, handler: toIdentity(row), threadId: row.thread_id };
}

function toGrant(row: unknown): Fails<WebhookCommandTokenGrant> {
  return Schema.decodeUnknownEffect(GrantRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: grantFrom }),
  );
}

const FIND_GRANT = `SELECT i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name, i.description, i.deactivated, i.brought_in_by, i.avatar, t.thread_id, t.expires_at
  FROM command_tokens AS t JOIN identities AS i ON i.name = t.handler_name WHERE t.hash = ?`;

function sqlWebhookCommandTokens(db: SqlDatabase): WebhookCommandTokensSection {
  return {
    addWebhookCommandToken: ({ expiresAt, handler, hash, threadId }) =>
      db.run(
        "INSERT INTO command_tokens (hash, handler_name, thread_id, expires_at) VALUES (?, ?, ?, ?)",
        hash,
        handler,
        threadId,
        expiresAt,
      ),
    findWebhookCommandToken: (hash) =>
      db.get(FIND_GRANT, hash).pipe(
        Effect.flatMap((row) => {
          if (typeof row === "object" && row !== null) {
            return toGrant(row);
          }
          return Effect.undefined;
        }),
      ),
  };
}

export {
  type WebhookCommandTokenGrant,
  type WebhookCommandTokensSection,
  type MemoryWebhookCommandTokensSection,
  type StoredWebhookCommandToken,
  memoryWebhookCommandTokens,
  sqlWebhookCommandTokens,
};

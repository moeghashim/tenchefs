import type { AppendMessageResult, MessagesSection, NewMessage } from "./messages.ts";
import type { DeliveriesSection, StoredDelivery } from "./deliveries.ts";
import type { StoredWebhookCommandToken, WebhookCommandTokensSection } from "./command-tokens.ts";
import { Effect } from "effect";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { sqlDeliveries } from "./deliveries.ts";
import { sqlWebhookCommandTokens } from "./command-tokens.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface NewWebhookCommandCall {
  readonly message: NewMessage;
  readonly token: Omit<StoredWebhookCommandToken, "threadId">;
  readonly delivery: Omit<StoredDelivery, "threadId" | "channel">;
}

interface WebhookCommandCallsSection {
  readonly appendWebhookCommandCall: (call: NewWebhookCommandCall) => Fails<AppendMessageResult>;
}

type CallParts = Pick<MessagesSection, "appendMessage"> &
  Pick<WebhookCommandTokensSection, "addWebhookCommandToken"> &
  Pick<DeliveriesSection, "addDelivery">;

interface SqlCallParts {
  readonly db: SqlDatabase;
  readonly appendMessage: CallParts["appendMessage"];
}

function storeCall(parts: CallParts): WebhookCommandCallsSection["appendWebhookCommandCall"] {
  return ({ delivery, message, token }) =>
    Effect.flatMap(parts.appendMessage(message), (result): Fails<AppendMessageResult> => {
      if (result.status !== "appended") {
        return Effect.succeed(result);
      }
      const { channel, id: threadId } = result.message;
      return Effect.as(
        Effect.andThen(
          parts.addWebhookCommandToken({ ...token, threadId }),
          parts.addDelivery({ ...delivery, channel, threadId }),
        ),
        result,
      );
    });
}

function memoryWebhookCommandCalls(parts: CallParts): WebhookCommandCallsSection {
  return { appendWebhookCommandCall: storeCall(parts) };
}

function sqlWebhookCommandCalls({ appendMessage, db }: SqlCallParts): WebhookCommandCallsSection {
  const { addWebhookCommandToken } = sqlWebhookCommandTokens(db);
  const { addDelivery } = sqlDeliveries(db);
  const store = storeCall({ addDelivery, addWebhookCommandToken, appendMessage });
  return { appendWebhookCommandCall: (call) => db.transaction(store(call)) };
}

export {
  type WebhookCommandCallsSection,
  type NewWebhookCommandCall,
  memoryWebhookCommandCalls,
  sqlWebhookCommandCalls,
};

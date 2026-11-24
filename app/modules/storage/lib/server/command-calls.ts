import type { AppendMessageResult, MessagesSection, NewMessage } from "./messages.ts";
import type { CommandTokensSection, StoredCommandToken } from "./command-tokens.ts";
import type { DeliveriesSection, StoredDelivery } from "./deliveries.ts";
import { Effect } from "effect";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { sqlCommandTokens } from "./command-tokens.ts";
import { sqlDeliveries } from "./deliveries.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface NewCommandCall {
  readonly message: NewMessage;
  readonly token: Omit<StoredCommandToken, "threadId">;
  readonly delivery: Omit<StoredDelivery, "threadId" | "channel">;
}

interface CommandCallsSection {
  readonly appendCommandCall: (call: NewCommandCall) => Fails<AppendMessageResult>;
}

type CallParts = Pick<MessagesSection, "appendMessage"> &
  Pick<CommandTokensSection, "addCommandToken"> &
  Pick<DeliveriesSection, "addDelivery">;

interface SqlCallParts {
  readonly db: SqlDatabase;
  readonly appendMessage: CallParts["appendMessage"];
}

function storeCall(parts: CallParts): CommandCallsSection["appendCommandCall"] {
  return ({ delivery, message, token }) =>
    Effect.flatMap(parts.appendMessage(message), (result): Fails<AppendMessageResult> => {
      if (result.status !== "appended") {
        return Effect.succeed(result);
      }
      const { channel, id: threadId } = result.message;
      return Effect.as(
        Effect.andThen(
          parts.addCommandToken({ ...token, threadId }),
          parts.addDelivery({ ...delivery, channel, threadId }),
        ),
        result,
      );
    });
}

function memoryCommandCalls(parts: CallParts): CommandCallsSection {
  return { appendCommandCall: storeCall(parts) };
}

function sqlCommandCalls({ appendMessage, db }: SqlCallParts): CommandCallsSection {
  const { addCommandToken } = sqlCommandTokens(db);
  const { addDelivery } = sqlDeliveries(db);
  const store = storeCall({ addCommandToken, addDelivery, appendMessage });
  return { appendCommandCall: (call) => db.transaction(store(call)) };
}

export { type CommandCallsSection, type NewCommandCall, memoryCommandCalls, sqlCommandCalls };

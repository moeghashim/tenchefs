import { appenderOf, sqlMessages } from "./messages-sqlite.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { sqlChannels } from "./channels.ts";
import { sqlReactions } from "./reactions-sqlite.ts";
import { sqlWebhookCommandCalls } from "./command-calls.ts";

type SqlMessageSections = ReturnType<typeof sqlChannels> &
  ReturnType<typeof sqlMessages> &
  ReturnType<typeof sqlReactions> &
  ReturnType<typeof sqlWebhookCommandCalls>;

function sqlMessageSections(db: SqlDatabase): SqlMessageSections {
  return {
    ...sqlChannels(db),
    ...sqlMessages(db),
    ...sqlReactions(db),
    ...sqlWebhookCommandCalls({ appendMessage: appenderOf(db), db }),
  };
}

export { sqlMessageSections };

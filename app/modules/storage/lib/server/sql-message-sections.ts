import { appenderOf, sqlMessages } from "./messages-sqlite.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { sqlChannels } from "./channels.ts";
import { sqlCommandCalls } from "./command-calls.ts";
import { sqlReactions } from "./reactions-sqlite.ts";

type SqlMessageSections = ReturnType<typeof sqlChannels> &
  ReturnType<typeof sqlMessages> &
  ReturnType<typeof sqlReactions> &
  ReturnType<typeof sqlCommandCalls>;

function sqlMessageSections(db: SqlDatabase): SqlMessageSections {
  return {
    ...sqlChannels(db),
    ...sqlMessages(db),
    ...sqlReactions(db),
    ...sqlCommandCalls({ appendMessage: appenderOf(db), db }),
  };
}

export { sqlMessageSections };

import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageService } from "./service.ts";
import { sqlAgentSessionSections } from "./agent-join-requests-sqlite.ts";
import { sqlHealth } from "./health.ts";
import { sqlIdentitySections } from "./identity-sections.ts";
import { sqlMessageReader } from "./messages-sqlite.ts";
import { sqlMessageSections } from "./sql-message-sections.ts";
import { sqlScheduledMessages } from "./scheduled-messages-sqlite.ts";
import { sqlSearch } from "./search-sqlite.ts";
import { sqlWebhookCommands } from "./commands.ts";

function sqlStorage(db: SqlDatabase): StorageService {
  return {
    ...sqlHealth(db),
    ...sqlIdentitySections(db),
    ...sqlMessageSections(db),
    ...sqlAgentSessionSections(db),
    ...sqlWebhookCommands(db),
    ...sqlSearch({ db, reader: sqlMessageReader(db) }),
    ...sqlScheduledMessages(db),
  };
}

export { sqlStorage };

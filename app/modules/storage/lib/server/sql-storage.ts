import type { SealingDatabase } from "./sealed-secrets.ts";
import type { StorageService } from "./service.ts";
import { sqlAgentSessionSections } from "./agent-join-requests-sqlite.ts";
import { sqlHealth } from "./health.ts";
import { sqlIdentitySections } from "./identity-sections-sql.ts";
import { sqlMessageReader } from "./messages-sqlite.ts";
import { sqlMessageSections } from "./sql-message-sections.ts";
import { sqlScheduledMessages } from "./scheduled-messages-sqlite.ts";
import { sqlSealedSecrets } from "./sealed-secrets.ts";
import { sqlSearch } from "./search-sqlite.ts";
import { sqlWebhookCommands } from "./commands-sqlite.ts";

function sqlStorage(sealing: SealingDatabase): StorageService {
  const { db } = sealing;
  return {
    ...sqlHealth(db),
    ...sqlIdentitySections(sealing),
    ...sqlMessageSections(db),
    ...sqlAgentSessionSections(db),
    ...sqlWebhookCommands(sealing),
    ...sqlSealedSecrets(sealing),
    ...sqlSearch({ db, reader: sqlMessageReader(db) }),
    ...sqlScheduledMessages(db),
  };
}

export { sqlStorage };

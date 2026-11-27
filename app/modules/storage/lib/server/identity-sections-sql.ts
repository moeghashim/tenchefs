import type { IdentitySections } from "./identity-section-types.ts";
import type { SealingDatabase } from "./sealed-secrets.ts";
import { sqlAdminSetting } from "./admin-setting.ts";
import { sqlIdentities } from "./identities.ts";
import { sqlLineage } from "./credential-lineage-sql.ts";
import { sqlLoginLinks } from "./login-links-sql.ts";
import { sqlLoginRequests } from "./login-requests-sqlite.ts";
import { sqlOfflineAlerts } from "./offline-alerts.ts";
import { sqlReach } from "./reach-sections.ts";

function sqlIdentitySections(sealing: SealingDatabase): IdentitySections {
  const { db } = sealing;
  return {
    ...sqlIdentities(db),
    ...sqlAdminSetting(db),
    ...sqlLoginRequests(db),
    ...sqlLoginLinks(db),
    ...sqlReach(sealing),
    ...sqlOfflineAlerts(db),
    ...sqlLineage(db),
  };
}

export { sqlIdentitySections };

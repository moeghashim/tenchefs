import type { IdentitySections, SectionsBesideIdentities } from "./identity-section-types.ts";
import { memoryAdminSetting, sqlAdminSetting } from "./admin-setting.ts";
import { memoryIdentities, sqlIdentities } from "./identities.ts";
import { memoryOfflineAlerts, sqlOfflineAlerts } from "./offline-alerts.ts";
import { memoryReach, sqlReach } from "./reach-sections.ts";
import { Effect } from "effect";
import type { MemoryState } from "./memory-state.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { memoryLoginRequests } from "./login-requests-memory.ts";
import { sqlLoginRequests } from "./login-requests-sqlite.ts";

type MemoryIdentitySections = ReturnType<typeof memoryIdentities> & SectionsBesideIdentities;

function memoryIdentitySections(state: MemoryState): MemoryIdentitySections {
  const identities = memoryIdentities(state);
  const { dropLoginCredentials, ...loginRequests } = memoryLoginRequests({
    findIdentity: identities.findIdentity,
    state,
    tokenRevoked: identities.tokenRevoked,
  });
  const { dropPresence, ...presence } = memoryReach(state);
  const { dropOfflineAlerts, ...offlineAlerts } = memoryOfflineAlerts(state);
  return {
    ...identities,
    ...memoryAdminSetting(identities),
    ...loginRequests,
    ...presence,
    ...offlineAlerts,
    deactivateIdentity: (name) =>
      Effect.tap(identities.deactivateIdentity(name), ({ status }) =>
        Effect.when(dropLoginCredentials(name), Effect.succeed(status === "deactivated")),
      ),
    removeIdentity: (name, messages) =>
      Effect.tap(identities.removeIdentity(name, messages), ({ status }) =>
        Effect.when(
          Effect.all([dropLoginCredentials(name), dropPresence(name), dropOfflineAlerts(name)], {
            concurrency: 1,
            discard: true,
          }),
          Effect.succeed(status === "deleted"),
        ),
      ),
  };
}

function sqlIdentitySections(db: SqlDatabase): IdentitySections {
  return {
    ...sqlIdentities(db),
    ...sqlAdminSetting(db),
    ...sqlLoginRequests(db),
    ...sqlReach(db),
    ...sqlOfflineAlerts(db),
  };
}

export { memoryIdentityLifecycle } from "./identity-lifecycle-memory.ts";

export { memoryIdentitySections, sqlIdentitySections };

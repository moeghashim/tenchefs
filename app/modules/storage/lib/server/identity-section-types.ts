import type { AdminSettingSection } from "./admin-setting.ts";
import type { IdentitiesSection } from "./identities.ts";
import type { LoginRequestsSection } from "./login-requests.ts";
import type { OfflineAlertsSection } from "./offline-alerts.ts";
import type { PresenceSection } from "./presence.ts";
import type { TriggersSection } from "./triggers.ts";

export type SectionsBesideIdentities = AdminSettingSection &
  LoginRequestsSection &
  PresenceSection &
  OfflineAlertsSection &
  TriggersSection;

export type IdentitySections = IdentitiesSection & SectionsBesideIdentities;

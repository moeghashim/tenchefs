import type { AgentJoinRequestsSection, JoinCodesSection } from "./agent-join-requests.ts";
import type { MessageSections, ScheduleMarking, ScheduledMessagesSection } from "./message-section-types.ts";
import type { AgentSessionsSection } from "./agent-sessions.ts";
import type { ChannelsSection } from "./channels.ts";
import type { HealthSection } from "./health.ts";
import type { IdentitySections } from "./identity-section-types.ts";
import type { InboxSection } from "./inbox.ts";
import type { SealedSecretsSection } from "./sealed-secrets.ts";
import type { WebhookCommandCallsSection } from "./command-calls.ts";
import type { WebhookCommandsSection } from "./commands.ts";

type BoardStorage = HealthSection &
  IdentitySections &
  ChannelsSection &
  MessageSections &
  InboxSection &
  AgentSessionsSection &
  WebhookCommandsSection &
  WebhookCommandCallsSection &
  AgentJoinRequestsSection &
  JoinCodesSection &
  SealedSecretsSection;

export type StorageService = BoardStorage & ScheduledMessagesSection;

export type MemoryBoard = BoardStorage & ScheduleMarking;

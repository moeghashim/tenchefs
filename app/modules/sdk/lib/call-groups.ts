import type { AgentCreationCalls, DescriptionCalls } from "../../identities/client.ts";
import type {
  AttachmentCalls,
  ClosedThreadCalls,
  MessageDeleteCalls,
  OpenThreadCalls,
  ScheduledMessageCalls,
  SearchCalls,
} from "../../messages/client.ts";
import type { IdentityMessageCountResponse, IdentityResponse } from "../../identities/index.ts";
import type { AgentApprovalCalls } from "./agent-sessions.ts";
import type { EventCalls } from "./events.ts";
import type { IdentityAvatarCalls } from "./avatars.ts";
import type { LoginCalls } from "./logins.ts";
import type { TriggerCalls } from "./triggers.ts";

interface IdentityDeletionCalls {
  readonly deleteIdentity: (name: string) => Promise<IdentityResponse>;
  readonly countMessagesBy: (name: string) => Promise<IdentityMessageCountResponse>;
}

export type CallGroups = LoginCalls &
  AgentApprovalCalls &
  AgentCreationCalls<IdentityResponse> &
  AttachmentCalls &
  IdentityAvatarCalls &
  IdentityDeletionCalls &
  DescriptionCalls<IdentityResponse> &
  ClosedThreadCalls &
  MessageDeleteCalls &
  OpenThreadCalls &
  SearchCalls &
  ScheduledMessageCalls &
  TriggerCalls &
  Pick<EventCalls, "presence" | "startWakeRun" | "endWakeRun" | "failWakeRun">;
export type { IdentityDeletionCalls };

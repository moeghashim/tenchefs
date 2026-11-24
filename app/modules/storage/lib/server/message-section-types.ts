import type { MessagesSection } from "./messages.ts";
import type { ReactionsSection } from "./reactions.ts";

export type MessageSections = MessagesSection & ReactionsSection;

export type { ScheduleMarking, ScheduledMessagesSection } from "./scheduled-messages.ts";

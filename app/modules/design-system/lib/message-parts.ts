import type { MenuChoice, MessageMenuParts, ReactionChoice, ThreadChoice } from "./menu-parts.ts";
import type { MessageTimeParts, Parts } from "./parts.ts";
import type { PresenceShown } from "./avatar-parts.ts";

interface MessageLayoutParts extends Parts {
  readonly name: string;
  readonly nameHref: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly grouped: boolean;
  readonly time: MessageTimeParts;
  readonly actionHref: string | null;
  readonly actionLabel: string;
  readonly onAction: (() => void) | null;
  readonly threadHref: string | null;
  readonly replyOnHover: boolean;
  readonly choices: readonly MenuChoice[];
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
}

interface MessageItemParts extends Omit<MessageLayoutParts, "choices" | "reactions" | "thread"> {
  readonly menu: MessageMenuParts;
  readonly threadOnHover: boolean;
  readonly mark: "for-you" | "open" | "linked" | "none";
  readonly day: string | null;
  readonly unreadLine: boolean;
}

interface StandaloneMessageParts extends MessageItemParts {
  readonly label: string;
}

export type { MessageItemParts, MessageLayoutParts, StandaloneMessageParts };

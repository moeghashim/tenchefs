import type { MenuIcon } from "./menu-icons.ts";
import type { Shortcut } from "./shortcut.ts";

interface ReactionChoice {
  readonly symbol: string;
  readonly keys: Shortcut;
  readonly inHoverBar: boolean;
  readonly onReact: () => void;
}

interface ThreadChoice {
  readonly label: string;
  readonly icon: MenuIcon;
  readonly name: string;
  readonly onSelect: () => void;
}

interface MessageMenuParts {
  readonly onMarkUnread: () => void;
  readonly onCopyLink: () => void;
  readonly onCopyText: () => void;
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
  readonly onDelete: (() => void) | null;
}

interface MessageActionParts {
  readonly actionHref: string | null;
  readonly actionLabel: string;
  readonly onAction: (() => void) | null;
  readonly threadHref: string | null;
}

interface MenuChoiceLabel {
  readonly label: string;
  readonly icon: MenuIcon;
  readonly keys: Shortcut;
}

type MenuChoice =
  | (MenuChoiceLabel & { readonly href: string; readonly onSelect: (() => void) | null })
  | (MenuChoiceLabel & {
      readonly href: null;
      readonly onSelect: () => void;
      readonly disabled?: boolean;
    });

interface ActionMenuParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly buttonLabel?: string;
}

interface HoverActionsParts extends Omit<MessageActionParts, "threadHref"> {
  readonly choices: readonly MenuChoice[];
  readonly replyOnHover: boolean;
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
}

export type {
  ActionMenuParts,
  HoverActionsParts,
  MenuChoice,
  MessageActionParts,
  MessageMenuParts,
  ReactionChoice,
  ThreadChoice,
};

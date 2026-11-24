import type { MenuIcon } from "./menu-icons.ts";

interface ReactionChoice {
  readonly symbol: string;
  readonly key: string;
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
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
}

interface MessageActionParts {
  readonly actionHref: string | null;
  readonly actionLabel: string;
  readonly onAction: (() => void) | null;
}

interface MenuChoiceLabel {
  readonly label: string;
  readonly icon: MenuIcon;
}

type MenuChoice =
  | (MenuChoiceLabel & { readonly href: string; readonly onSelect: null })
  | (MenuChoiceLabel & {
      readonly href: null;
      readonly onSelect: () => void;
      readonly shortcut?: string;
      readonly disabled?: boolean;
    });

interface ActionMenuParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly buttonLabel?: string;
}

interface HoverActionsParts extends MessageActionParts {
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

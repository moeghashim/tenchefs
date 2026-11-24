import type { ActionMenuParts, MenuChoice, MessageMenuParts, ReactionChoice, ThreadChoice } from "./menu-parts.ts";
import type { AvatarParts, PresenceShown, SuggestionOptionParts } from "./avatar-parts.ts";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import type { ReactNode } from "react";

interface Parts {
  readonly children: ReactNode;
}

interface LinkParts extends Parts {
  readonly href: string;
}

interface ListParts extends Parts {
  readonly label: string;
}

interface ButtonParts extends Parts {
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

interface FormParts extends Parts {
  readonly label: string;
  readonly field: string;
  readonly onSubmit: (value: string) => void;
}

interface TextFieldParts {
  readonly label: string;
  readonly name: string;
}

interface DataAreaParts extends TextFieldParts {
  readonly value: string;
  readonly onEdit: (text: string) => void;
}

interface TextAreaParts extends TextFieldParts {
  readonly value: string;
  readonly caret: number;
  readonly onEdit: (text: string, caret: number) => void;
  readonly choosing: boolean;
  readonly onPick: () => void;
  readonly onMove: (direction: "down" | "up") => void;
  readonly focused: boolean;
  readonly focusRequests: number;
  readonly onClose: () => void;
}

interface SuggestionsParts {
  readonly label: string;
  readonly options: readonly SuggestionOptionParts[];
  readonly highlighted: number;
  readonly onChoose: (option: string) => void;
}

interface TagParts {
  readonly label: string;
}

interface ChipParts extends Parts {
  readonly pressed: boolean;
  readonly onClick: () => void;
}

interface FilterFieldParts {
  readonly label: string;
  readonly value: string;
  readonly onEdit: (text: string) => void;
}

interface IdentityRowParts {
  readonly href: string;
  readonly name: string;
  readonly displayName: string | null;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly active: boolean;
  readonly detail: string;
  readonly note: string | null;
  readonly children?: ReactNode;
}

interface ProfileParts extends Parts {
  readonly name: string;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
}

interface ProfileNameParts {
  readonly name: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly children?: ReactNode;
}

interface DateTextParts {
  readonly time: string;
}

interface IdentityLinkParts {
  readonly href: string;
  readonly name: string;
  readonly displayName: string | null;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly active: boolean;
}

interface StatusBarParts extends ListParts {
  readonly shown: boolean;
}

interface WorkspaceParts extends Parts {
  readonly sidebarOpen: boolean;
  readonly onToggleSidebar: () => void;
}

interface SidebarParts extends Parts {
  readonly label: string;
  readonly title: string;
  readonly home: string;
  readonly open: boolean;
  readonly collapsed: boolean;
  readonly onFollowHome: () => void;
  readonly onToggleCollapsed: () => void;
  readonly edge: PanelEdgeParts;
}

interface NavLinkParts {
  readonly href: string;
  readonly children?: ReactNode;
  readonly label: string;
  readonly active: boolean;
  readonly marked: boolean;
  readonly icon: "inbox" | "people" | "channel";
  readonly menu?: ActionMenuParts;
}

interface PillParts {
  readonly count: number;
  readonly label: string;
  readonly tone: "loud" | "quiet" | "unseen";
}

interface PaneHeaderParts {
  readonly title: string;
  readonly description: string | null;
  readonly sans?: boolean;
  readonly children?: ReactNode;
}

interface PressButtonParts extends Parts {
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

interface ChoiceParts {
  readonly label: string;
  readonly value: string;
}

interface ChoiceGroupParts {
  readonly label: string;
  readonly choices: readonly ChoiceParts[];
  readonly value: string;
  readonly onChoose: (value: string) => void;
}

interface AuthorParts extends AvatarParts {
  readonly shown: string;
  readonly handle: string | null;
}

interface DataBlockParts {
  readonly label: string;
  readonly value: unknown;
}

interface MessageTimeParts {
  readonly iso: string;
  readonly short: string;
  readonly ago: string;
  readonly full: string;
  readonly receipt: string | null;
}

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

interface MentionParts extends Parts {
  readonly mine: boolean;
}

interface CallChipParts {
  readonly command: string;
  readonly label: string;
  readonly value: unknown;
}

interface ChannelStartParts {
  readonly title: string;
  readonly description: string;
}

interface SeparatorParts {
  readonly label: string;
}

interface MessageHeaderParts {
  readonly name: string;
  readonly nameHref: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly agent: boolean;
  readonly time: MessageTimeParts;
}

interface ShownTimeParts {
  readonly iso: string;
  readonly full: string;
  readonly shown: string;
  readonly hidden: boolean;
  readonly receipt: string | null;
}

interface SkeletonParts {
  readonly width: "short" | "long";
}

export type {
  StatusBarParts,
  IdentityLinkParts,
  ChipParts,
  DateTextParts,
  FilterFieldParts,
  IdentityRowParts,
  ProfileNameParts,
  ProfileParts,
  TagParts,
  AuthorParts,
  CallChipParts,
  ChannelStartParts,
  MentionParts,
  MessageHeaderParts,
  MessageLayoutParts,
  MessageItemParts,
  ShownTimeParts,
  SeparatorParts,
  StandaloneMessageParts,
  ButtonParts,
  ChoiceGroupParts,
  NavLinkParts,
  PaneHeaderParts,
  PressButtonParts,
  PillParts,
  SidebarParts,
  WorkspaceParts,
  DataAreaParts,
  DataBlockParts,
  FormParts,
  LinkParts,
  ListParts,
  Parts,
  SkeletonParts,
  SuggestionsParts,
  TextAreaParts,
  TextFieldParts,
};

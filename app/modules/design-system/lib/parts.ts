import type { AvatarParts, PresenceShown } from "./avatar-parts.ts";
import type { ActionMenuParts } from "./menu-parts.ts";
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

interface FeedParts extends ListParts {
  readonly feed?: string | null;
  readonly more: boolean;
  readonly busy: boolean;
}

interface ButtonParts extends Parts {
  readonly disabled?: boolean;
  readonly focused?: boolean;
  readonly unavailable?: boolean;
  readonly onClick: () => void;
}

interface FormParts extends Parts {
  readonly label: string;
  readonly field: string;
  readonly onSubmit: (value: string) => void;
  readonly flush?: boolean;
}

interface FieldParts {
  readonly label: string;
  readonly name: string;
}

interface TextFieldParts extends FieldParts {
  readonly focused?: boolean;
  readonly kind?: "secret" | "text";
}

interface DataAreaParts extends FieldParts {
  readonly value: string;
  readonly onEdit: (text: string) => void;
}

interface TextAreaParts extends FieldParts {
  readonly value: string;
  readonly caret: number;
  readonly onEdit: (text: string, caret: number) => void;
  readonly choosing: boolean;
  readonly list: string;
  readonly highlighted: number;
  readonly onPick: () => void;
  readonly onMove: (direction: "down" | "up") => void;
  readonly focused: boolean;
  readonly focusRequests: number;
  readonly onClose: () => void;
  readonly onPasteFiles: (files: readonly File[]) => void;
  readonly required: boolean;
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
  readonly tabbable: boolean;
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

interface MessageBodyParts extends Parts {
  readonly foldable: boolean;
  readonly onUnfold: () => void;
}

interface MentionParts extends Parts {
  readonly mine: boolean;
}

interface CallChipParts {
  readonly webhookCommand: string;
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
  MessageBodyParts,
  MessageTimeParts,
  MessageHeaderParts,
  ShownTimeParts,
  SeparatorParts,
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
  FeedParts,
  ListParts,
  Parts,
  SkeletonParts,
  TextAreaParts,
  TextFieldParts,
};

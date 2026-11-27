/**
 * The design system's content: text, names, avatars, lists and live regions (`layout.tsx` has the design system as a whole).
 *
 * - `Pill` is a count read out by its label, loud (the unread colour), quiet, or unseen (read out only).
 * - A name's avatar is its picture, from the nearest `AvatarImages` source, named by its display name; or, when it has none or the picture fails to load, its coloured initials, one of eight hues hashed from the name. It is a circle for a human and a rounded square for an agent, with its `PresenceDot` in the corner once its presence is known. Every avatar of a name (a message's, a row's, a profile's, a mention suggestion's, an identity card's tile) shows the same picture, and a new one as soon as the source has it.
 * - `AvatarImages` is the source of avatar pictures the views provide, by name; with none, every avatar shows its initials.
 * - `PresenceDot` is filled in the online colour while online, a hollow grey ring while offline, a ring in the accent with a dot in its middle for the owner's warning ("Offline, went offline unexpectedly"), named for a screen reader and as a tooltip ("Offline, last seen 5 minutes ago"), as a `Suggestions` option shows it beside the name.
 * - `Author` is a message's avatar and name (a display name, with the `@name` muted beside it), with an `agent` tag for an agent.
 * - `Tag` is one such small tag, such as `admin`.
 * - `IdentityLink` is the logged-in identity's avatar and name as a link, highlighted when open.
 * - `IdentityRow` is a link to an identity, with its avatar, name, any tags and a muted detail line, highlighted when open.
 * - `ProfileFrame` is one identity's whole profile, filling its panel: its `Profile` pinned on top, then its `ProfileSections`.
 * - `ProfileSections` holds a profile's `ProfileSection`s, with more space between them than inside each, and scrolls them under the `Profile` when they don't fit, so the page itself never scrolls.
 * - `Profile` is one identity's large avatar beside its `ProfileName`, its details and any control for the avatar, at the top of its `ProfileFrame`.
 * - `ProfileSection` is a group of a profile's controls under a small muted heading (a level-4 heading naming the section).
 * - `ProfileName` is an identity's name and any tags, as a heading.
 * - `DateText` is a moment as a date, in mono.
 * - `QuietLink` is a muted link in such a line, such as a name linking to its profile.
 * - `Heading` is part of the card's title row.
 * - `Muted` is too.
 * - `MutedLines` is muted text that keeps its line breaks.
 * - `LinkList` is a named list of links, each a `LinkRow`.
 * - `LinkRow` is one link in a `LinkList`.
 * - `ItemList` is a named list of plain rows, each an `ItemRow`.
 * - `ItemRow` is one plain row in an `ItemList`.
 * - `CurrentItemRow` is an `ItemRow` that is highlighted, and marked `aria-current`, while `current`, such as the schedule a post's marker opened.
 * - `Alert` is a refusal, read out by screen readers.
 * - `Announcement` is a polite live region (its text again as its count moves).
 * - `Notice` is a passing word on what just happened, read out politely.
 * - `Skeleton` stands in while something loads.
 *
 * Wherever an identity has a display name (`IdentityLink`, `IdentityRow`, `ProfileName`, a `Suggestions` option's muted detail) it shows first and the `@name` muted beside it.
 */
export {
  Alert,
  Announcement,
  Heading,
  ItemList,
  ItemRow,
  CurrentItemRow,
  LinkList,
  LinkRow,
  Muted,
  MutedLines,
  QuietLink,
  Notice,
  Pill,
  Skeleton,
  Tag,
  IdentityLink,
  DateText,
  IdentityRow,
  Profile,
  ProfileFrame,
  ProfileSections,
  ProfileName,
  ProfileSection,
  AvatarImages,
} from "./lib/content.ts";
export type { AvatarImage, AvatarImageSource } from "./lib/avatar-parts.ts";

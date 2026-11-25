/**
 * The design system's messages: message lists, a message and its parts, threads, reactions, menus and identity cards (`layout.tsx` has the design system as a whole).
 *
 * - `ActionMenu` is a menu outside a message: right-clicking its children, or Shift+F10 or the menu key in them, opens its `choices` (each showing any `keys` it has) as a context menu named by its `label`; a More actions button (or `buttonLabel`), shown on hover or focus (`inline`: before a name), opens them as a dropdown.
 * - `PersonMenu` is a name's `ActionMenu`; under a `PersonKeysArea`, its keys (View profile, Message, Copy name, said through the keys' `announce`) act on the name while focus is in it; Message, its menu item and its key, only under an `IdentityCardComposer`, where there is a message box to mention them in.
 * - `Mention` is an `@` mention in a message's text, in the mention colour when it is the reader's own (`mine`).
 * - `MessageList` is a named `feed` of `MessageItem`s (`aria-busy` while `busy`; `aria-setsize` -1 while `more`) with one Tab stop: the item focused last or the newest (see its ADR); `feed` is its element ID.
 * - `MessageItem` is one message, an `article` labelled by its author and time, which takes focus, with its avatar, name and time, or only its time on hover when `grouped` under the one before; the day's separator and the "New" line above it when it starts them; a mark (`for-you`, the filled accent block, when it mentions or answers the reader, or `open`); and, shown on hover or focus, a "Quick actions" group of icon buttons, each with no text and named by its tooltip: a button for each of its `menu`'s `reactions` that is `inHoverBar`, then, when `replyOnHover`, its action (such as Reply: a link, or a button with `onAction`), then its thread choice when `threadOnHover`, then More actions; given a `threadHref`, a `hidden` Open thread link sits outside the group (#568: the bar shows Reply, not both); under `MessageKeys`, Reply and Open thread name their shortcuts in `aria-keyshortcuts`. Each reaction's button has its `key` as `aria-keyshortcuts` for the keymap to press. Every menu choice with keys and an action (not a link) also gets a `hidden` button naming them in `aria-keyshortcuts`, after the hover buttons, so the keymap can press a choice that has no button on show (a reaction not in the hover bar, Mark unread, Copy link, the thread choice). Its `menu` gives it one actions menu (the action, then Open thread, then each reaction, then Mark unread, then Copy link, then the thread choice, such as Close, if any, each showing its shortcut from `MessageKeys`), drawn two ways on Radix: right-clicking the message, or the context-menu key or Shift+F10 on it, opens it as a context menu at the pointer, and the More actions button opens it as a dropdown. Every menu item draws its `icon` (a `ThreadChoice` names one too), which its type requires, before its label. An item may be `disabled`, dimmed and not chosen. Radix gives both their keyboard and focus behaviour; a chosen item's action runs once the menu has closed. An item given `keys` (a `Shortcut`) names them in `aria-keyshortcuts` and shows their label at its end. As well as its key, an Alt-click (Option-click on macOS) on the message, but not on a link, button or other interactive element in it, runs Mark unread at once and focuses and selects nothing. A message's time takes focus, and hovering or focusing it opens a tooltip with the full date and time and, when the message has one, its read receipt.
 * - `StandaloneMessage` is one named message on its own, such as a thread's parent, which takes focus while linked; an Alt-click on it runs Mark unread as on a `MessageItem`.
 * - `IdentityCard` is what a message's author name and an `@name` in its text each are: hovering it (after a short delay) or focusing it opens a card, a Radix tooltip beside the name, kept inside the window: a labelled `dialog` led by a square avatar tile (grey when deactivated; an Agent chip on an agent's), then its name, `@name` handle, presence or a red Deactivated, kind, description, an agent's Open session ↗ (its `sessionOf`, in a new tab), and Message (calls the nearest `IdentityCardComposer`; disabled when deactivated or with none) and View profile. Tab on the name moves into it; Escape or Tab past either end closes it, focus back on the name. Its card comes from the `IdentityCards` source the views provide; with none, the name is drawn alone.
 * - `IdentityCards` is the source of identity cards the views provide.
 * - `IdentityCardComposer` is what an identity card's Message calls, the nearest one.
 * - `MessageBody` holds a message's rendered Markdown text, `Mention` an `@name` in it.
 * - `CallChip` is a command call and its data.
 * - `AttachmentList` is a message's named list of attachments, under its text, each in an `AttachmentItem`.
 * - `ImageThumbnail` is an image attachment: a button holding its `AttachmentImage`, scaled to fit 300 by 200 pixels and sized from the image's `size` so it keeps its space while loading (a 300 by 200 box when the size is unknown). Clicking it, or Enter or Space on it, opens the image at full size in a modal dialog named by the image's name, with its `detail` (such as its size) beside the name; Escape or a click outside closes it, and focus returns to the thumbnail.
 * - `AttachmentImage` is an image attachment's picture alone, named by its name: the thumbnail's, or a `small` one (72 by 48 pixels at most) where a button can't go, such as a search result. While it loads, or when it can't be shown, its name stays unseen inside its box.
 * - `FileChip` is any other attachment: its name and `detail` (such as its size) after a file icon, a download link to `href`, or plain text where `href` is `null`. Nothing but an image is ever drawn as one.
 * - `DataToggle` is a message's data folded away.
 * - `ThreadSummary` is a link to a message's thread: its repliers' avatars, its reply count, how many replies are new (bold, after an accent dot and with how many are to the reader when any is) and when it was last replied to.
 * - `ReactionChips` is a message's named row of `ReactionChip`s.
 * - `ReactionChip` is a reaction and its count, pressed (in the accent) when one is the reader's own, with who reacted as its tooltip.
 * - `RepliesDivider` heads a thread's replies.
 * - `ChannelStart` says a channel has nothing older.
 * - `ClosedFold` is an item of a message list standing for closed threads folded away, an `article` named by its button on a dashed line that unfolds them; given a `day`, the day's label (a separator to a screen reader) shares that line, in place of a day separator of its own beside it: the label in the line's centre, the button at its right end, shortening rather than overlapping the label on a narrow line.
 * - `ThreadBar` is a muted bar across the top of a thread: a line of text and one icon button named by its tooltip, such as who closed it and Reopen thread.
 */
export {
  AttachmentImage,
  AttachmentItem,
  AttachmentList,
  CallChip,
  ChannelStart,
  DataToggle,
  FileChip,
  ImageThumbnail,
  MessageBody,
  MessageItem,
  MessageList,
  ClosedFold,
  ThreadBar,
  RepliesDivider,
  ThreadSummary,
  StandaloneMessage,
  Mention,
  IdentityCard,
  PersonMenu,
  PersonKeysArea,
  MessageKeys,
  IdentityCardComposer,
  IdentityCards,
  ReactionChip,
  ReactionChips,
} from "./lib/messages.ts";
export type {
  ImageBox,
  PersonKeysSource,
  MessageShortcuts,
  IdentityCardLink,
  IdentityCardParts,
  IdentityCardSession,
  IdentityCardSource,
  ActionMenuParts,
  MenuChoice,
  ReactionChoice,
  ThreadChoice,
} from "./lib/messages.ts";

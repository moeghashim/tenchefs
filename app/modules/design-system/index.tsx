/**
 * The design system: hand-written Tailwind components styled after shadcn/ui
 * (its token names and its card), in a Vercel-like neutral look with small
 * pops of colour (ADR 0034, ADR 0040). Every view builds from these and none
 * styles itself, so no component takes classes. `styles.css` is the Tailwind
 * theme, which `index.html` loads: its tokens are CSS variables, dark by
 * default, light under `data-theme="light"` on the root element, and light
 * under `prefers-color-scheme: light` unless `data-theme="dark"`; components
 * read tokens, never raw colours. Text and the UI are sans, times and channel
 * names mono.
 *
 * `Workspace` is the page around every route once logged in: a `Sidebar` on
 * the left (on a narrow screen, behind a button that opens and closes it),
 * which a button at its top collapses to a narrow rail holding only that
 * button on a wide screen (`collapsed`),
 * with its `SidebarBody` of links (following one, but not pressing a button, closes it on a narrow screen)
 * and its `SidebarFooter`, and a `WorkspaceMain` of the route's panes on the
 * right, in a `WorkspaceColumn` under any `StatusBar`: a named polite live
 * region that shows its text in a bar, in the attention colours, only while
 * `shown`, such as "Reconnecting…". In the sidebar, `NavLink` is one link, bold when
 * it has something new (`marked`), highlighted when it is the open item, with
 * an icon and any `Pill` after it: a count read out by its label, loud (the
 * unread colour), quiet, or unseen (read out only); `NavHeading` heads a
 * `NavList` of links, with any `HeadingButton` on its line, a plus named by
 * its label that starts something new, such as a channel; in the footer, `FooterLink` is a link
 * with a gear, such as Settings, highlighted when open. `Pane` is
 * the main column, with a `PaneHeader` (title, description and any action on
 * its right, such as a `PressButton`, a button that is on or off), a
 * named `Page` that scrolls a centred column of `PageSection`s, each headed by
 * a link to itself, its heading focused when `focused` (such as Settings,
 * where `ChoiceGroup` picks one of a few choices), a
 * named `ScrollArea` that stays scrolled to the end as what it counts grows, unless
 * scrolled up, and anything under it, such as a message box in a `BoxFrame`
 * with its keyboard hint; `SidePanel` is a
 * named column on its right with a close link (the whole width on a narrow
 * screen). A split view, such as the inbox's, is a `ListPane` (the main column,
 * hidden on a narrow screen while `hiddenWhenNarrow`) beside a
 * `ConversationPanel`, a named column with a `BackLink` arrow (shown only on a
 * narrow screen, where the panel takes the whole width), its detail, its
 * header's `actions` as small buttons (each naming its key in `aria-keyshortcuts` and a tooltip), and any open link (naming its key, `CONVERSATION_KEYS.open`, in
 * `aria-keyshortcuts` and a tooltip; `CONVERSATION_KEYS` also holds the keys for Mark read and Mark unread), or beside
 * a `ConversationEmpty`, a named column holding only a
 * muted line (hidden on a narrow screen); a
 * `DividerButton` is a divider line led by a quiet button, such as one that
 * shows the replies folded under it. A name's avatar is its coloured initials, one of eight hues hashed
 * from the name, a circle for a human and a rounded square for an agent, with
 * its `PresenceDot` in the corner once its presence is known: filled in the
 * online colour while online, a hollow grey ring while offline, a ring in the
 * accent with a dot in its middle for the owner's warning ("Offline, went
 * offline unexpectedly"), named for a
 * screen reader and as a tooltip ("Offline, last seen 5 minutes ago"), as a
 * `Suggestions` option shows it beside the name;
 * `Author` is a message's avatar and name (a display name, with the `@name`
 * muted beside it), with an `agent` tag for an agent;
 * `Tag` is one such small tag, such as `admin`. `IdentityLink` is the
 * logged-in identity's avatar and name as a link, highlighted when open.
 * Wherever an identity has a display name (`IdentityLink`, `IdentityRow`,
 * `ProfileName`, a `Suggestions` option's muted detail) it shows first and the
 * `@name` muted beside it. `LineForm` is a named form of one labelled line of
 * text, whose text its owner holds, with a Save button (disabled while
 * saving; `submit` names its button, `Save` unless given) and anything under
 * it, such as an `Alert`. `AreaForm` is its form of a few growing lines of
 * text, up to `limit` characters shown as a counter, where Enter starts a new
 * line and Ctrl/Cmd+Enter saves. `ActionGroup` is a named group of what can be done
 * to one thing, `ButtonRow` puts buttons side by side, and `TokenText` shows a
 * secret, such as a fresh token, to copy.
 * `ConfirmDialog` asks before an action, in a modal shadcn AlertDialog on
 * Radix's primitives (ADR 0058), the one part built on a library: its title, a
 * body naming exactly what happens, Cancel and a confirm button, in the
 * destructive colour when the action can't be undone. It holds focus inside
 * while open, Escape or Cancel calls `onCancel`, and focus goes back to what
 * opened it when it closes. While `pending` both buttons are disabled and the
 * confirm button says so; an `error` shows inside it. Its owner decides
 * when it is `open`, so it never closes on its own.
 * `PaneHeader`'s title is mono, as a channel's name, unless `sans`. A
 * `Toolbar` under it holds a `FilterField` (a labelled box whose text its
 * owner holds) and `Chip`s, buttons pressed or not; a named `ListArea` scrolls
 * from the top, and its `IdentityRow`s are links to identities, each with
 * its avatar, name, any tags and a muted detail line, highlighted when open.
 * `Profile` is one identity's large avatar beside its `ProfileName` (its
 * name and any tags, as a heading) and its details; `DateText` is a moment as a date, in mono.
 *
 * `Feed` is a named, centred column that scrolls, such as the inbox, read
 * from the top: a `FeedHeading` heads a part of it, with its count, or, with
 * no count, as a divider line; a `FeedList` is a named list of `FeedRow`s,
 * each a link over the whole row (named by its text) leading with why it is
 * there (`why`), then a message with its author's avatar and name (its own
 * link, to `authorHref`, above the row's), what they did (`action`) and in which channel, a
 * short time, a `Closed` marker when it is `closed` (its thread is closed), any `count` of how many of its messages are new ("3 new") and any
 * `context` line (a reply's thread), then what it holds: its `FeedText`, up to
 * two lines, and any `RowButton`, a small button raised above the row's link. A `for-you` row has an accent dot and why,
 * a bold name and bright text; an `activity` row has a muted dot and why, a
 * bold name and bright text; a `read` one is muted. A `current` row, the one
 * whose conversation is shown, is highlighted and its link marked as the current page. A `FeedNoticeRow` sits in
 * a `FeedList` for an Inbox entry about an identity rather than a message: its
 * why, then the identity's avatar and name (a link to `href`) and a short
 * time, then any buttons; `for-you` or `read` as a `FeedRow`. `Mention` is
 * an `@` mention in a message's text, in the mention colour when it is the
 * reader's own (`mine`). `FeedNote` is a muted line in a feed: why a part is
 * `empty`, or that it has reached the `end`; `MoreButton` is a quiet
 * full-width row under a list that loads more of it, with a spinner while
 * `loading`.
 * `MessageList` is a named list of `MessageItem`s: one message each, which
 * takes focus, with its avatar, name and time, or only its time on hover when
 * `grouped` under the one before; the day's separator and the "New" line above it when it starts them; a
 * mark (`for-you`, the filled accent block, when it mentions or answers the reader, or `open`); and an action (such as Reply: a link, or a button with `onAction`) and
 * a More actions button shown on hover or focus, after a button for each of its `menu`'s `reactions`; a reaction's
 * `key`, pressed while the message itself has focus, leaves it too. Its `menu` gives it one actions menu (the action,
 * then each reaction, then Mark unread, then the thread choice, such as Close, if any), drawn two ways on Radix: right-clicking the message opens it as a context menu at the pointer, and the
 * More actions button opens it as a dropdown. Every menu item draws its `icon` (a `ThreadChoice` names one too), which its type requires, before its label. Radix gives both their keyboard and focus behaviour; a chosen item's
 * action runs once the menu has closed. Mark unread's tooltip names its shortcut, `Alt-click`: an Alt-click (Option-click
 * on macOS) on the message, but not on a link, button or other interactive element in it, runs Mark unread at once and
 * focuses and selects nothing; `StandaloneMessage` does the same. `StandaloneMessage` is one named message on its own, such as a
 * thread's parent. A message's author name and an `@name` in its text are each an `IdentityCard`: hovering it
 * (after a short delay) or focusing it opens a card, a Radix tooltip whose pointer can rest on it. The card leads
 * with a header like `Profile`'s: the identity's large `Avatar` (with its presence dot, and none when its presence
 * isn't known) beside its shown name, its `@name` handle and an agent's tag. Below come its presence words, its kind
 * (an agent's owner), any description, Deactivated, and a View profile link; pointer leave, Escape or blur closes it, and focus stays on the name. Its card comes from the
 * `IdentityCards` source the views provide; with none, the name is drawn alone. In a message, `MessageBody` holds its rendered Markdown text, `Mention` an
 * `@name` in it, `CallChip` a command call
 * and its data, `DataToggle` its data folded away, and `ThreadSummary` a link to
 * its thread: its repliers' avatars, its reply count, how many replies are new (bold, after an accent dot and with how many are to the reader when any is) and when it was last replied to. A message's time
 * takes focus, and hovering or focusing it opens a tooltip with the full date and time and, when the message has one, its read receipt. `ReactionChips` is a message's named row of
 * `ReactionChip`s, each a reaction and its count, pressed (in the accent) when one is the reader's own, with who
 * reacted as its tooltip. `RepliesDivider` heads a thread's replies, `ChannelStart` says a
 * channel has nothing older, and `QuietButton` is a muted centred button,
 * such as loading older messages. `ClosedFold` is a row of a message list standing for closed threads folded away,
 * a button on a dashed line that unfolds them; given a `day`, the day's label (a separator to a screen reader) shares
 * that line, in place of a day separator of its own beside it. `ThreadBar` is a muted bar across the top of a thread: a line of text
 * and one button, such as who closed it and Reopen; `QuietLink` is a muted link in such a line, such as a name
 * linking to its profile. `TextArea` takes focus when it first appears
 * if `focused`.
 *
 * `AppShell` is the page around the login view; `Card`, centred in a scrolling column, `CardHeader`,
 * `Heading` and `Muted` are a shadcn-style card and its title row, `CardBody`
 * a padded section under it; `MutedLines` is muted text that keeps its line
 * breaks; `LinkList` and
 * `LinkRow` are a named list of links, and `ItemList` and `ItemRow` a named
 * list of plain rows; `Alert` is a refusal, read out by screen readers;
 * `Notice` is a passing word on what just happened, read out politely;
 * `Skeleton` stands in while something loads. `Form` hands one field's value
 * to `onSubmit` without reloading the page; `TextField` is a labelled secret
 * input in it, such as a token, `TextArea` a labelled box to write in, such
 * as a reply, whose text and caret its owner holds, where Enter sends the form
 * and Shift+Enter starts a new line, and, while its owner is `choosing` from
 * suggestions, the arrow keys move the highlight, Enter or Tab picks it and
 * Escape closes the list;
 * `SubmitButton` sends it, and `SendButton` is its paper-plane icon form, named
 * and tooltipped by `label`; `Suggestions` is a named list of options to pick
 * from under a box, such as mentions or commands (each with any muted detail
 * after it), one of them highlighted, which leaves the box focused; it sits
 * in the overlay layer, above everything else in the pane.
 * `DataArea` is a labelled box to write JSON in, whose
 * text its owner holds. `PromptForm` is a named card in place of a message
 * box that asks for a command's data, titled, with a Cancel and a submit
 * button, its first field focused, and Escape anywhere in it calls
 * `onEscape`; in it `InputField` (text, a number or an
 * integer), `PickField` (one of a list, or none) and `CheckField` (a checkbox)
 * are labelled fields whose value their owner holds, each marked when
 * required, with its help text and any error under it, both read out as its
 * description.
 */
export { ActionGroup } from "./lib/action-group.tsx";
export { Alert } from "./lib/alert.tsx";
export { ConfirmDialog } from "./lib/confirm-dialog.tsx";
export { ButtonRow } from "./lib/button-row.tsx";
export { TokenText } from "./lib/token-text.tsx";
export { CallChip } from "./lib/call-chip.tsx";
export { ChannelStart } from "./lib/channel-start.tsx";
export { DataToggle } from "./lib/data-toggle.tsx";
export { MessageBody } from "./lib/message-body.tsx";
export { MessageItem } from "./lib/message-item.tsx";
export { MessageList } from "./lib/message-list.tsx";
export { QuietButton } from "./lib/quiet-button.tsx";
export { ClosedFold } from "./lib/closed-fold.tsx";
export { ThreadBar } from "./lib/thread-bar.tsx";
export { MoreButton } from "./lib/more-button.tsx";
export { RepliesDivider } from "./lib/replies-divider.tsx";
export { ThreadSummary } from "./lib/thread-summary.tsx";
export { StandaloneMessage } from "./lib/standalone-message.tsx";
export { AppShell } from "./lib/app-shell.tsx";
export { BoxFrame } from "./lib/box-frame.tsx";
export { Button } from "./lib/button.tsx";
export { Card } from "./lib/card.tsx";
export { CheckField } from "./lib/check-field.tsx";
export { CardBody } from "./lib/card-body.tsx";
export { CardHeader } from "./lib/card-header.tsx";
export { ChoiceGroup } from "./lib/choice-group.tsx";
export { DataArea } from "./lib/data-area.tsx";
export { Feed } from "./lib/feed.tsx";
export { FeedHeading } from "./lib/feed-heading.tsx";
export { FeedList } from "./lib/feed-list.tsx";
export { FeedNote } from "./lib/feed-note.tsx";
export { FeedNoticeRow } from "./lib/feed-notice-row.tsx";
export { FeedRow } from "./lib/feed-row.tsx";
export { FeedText } from "./lib/feed-text.tsx";
export { Form } from "./lib/form.tsx";
export { LineForm } from "./lib/line-form.tsx";
export { AreaForm } from "./lib/area-form.tsx";
export { Heading } from "./lib/heading.tsx";
export { InputField } from "./lib/input-field.tsx";
export { ItemList } from "./lib/item-list.tsx";
export { ItemRow } from "./lib/item-row.tsx";
export { LinkList } from "./lib/link-list.tsx";
export { LinkRow } from "./lib/link-row.tsx";
export { Mention } from "./lib/mention.tsx";
export { IdentityCard } from "./lib/identity-card.tsx";
export { IdentityCards } from "./lib/identity-card-parts.ts";
export type { IdentityCardParts, IdentityCardSource } from "./lib/identity-card-parts.ts";
export { Muted } from "./lib/muted.tsx";
export { MutedLines } from "./lib/muted-lines.tsx";
export { ReactionChip } from "./lib/reaction-chip.tsx";
export { ReactionChips } from "./lib/reaction-chips.tsx";
export type { ReactionChoice, ThreadChoice } from "./lib/menu-parts.ts";
export { QuietLink } from "./lib/quiet-link.tsx";
export { Notice } from "./lib/notice.tsx";
export { HeadingButton } from "./lib/heading-button.tsx";
export { NavHeading } from "./lib/nav-heading.tsx";
export { NavLink } from "./lib/nav-link.tsx";
export { NavList } from "./lib/nav-list.tsx";
export { Pane } from "./lib/pane.tsx";
export { ListPane } from "./lib/list-pane.tsx";
export { ConversationEmpty } from "./lib/conversation-empty.tsx";
export { ConversationPanel } from "./lib/conversation-panel.tsx";
export type { PanelAction } from "./lib/panel-action-button.tsx";
export { CONVERSATION_KEYS } from "./lib/conversation-keys.ts";
export { DividerButton } from "./lib/divider-button.tsx";
export { PaneHeader } from "./lib/pane-header.tsx";
export { Page } from "./lib/page.tsx";
export { PageSection } from "./lib/page-section.tsx";
export { FooterLink } from "./lib/footer-link.tsx";
export { PressButton } from "./lib/press-button.tsx";
export { PickField } from "./lib/pick-field.tsx";
export { Pill } from "./lib/pill.tsx";
export { PromptForm } from "./lib/prompt-form.tsx";
export { SidePanel } from "./lib/side-panel.tsx";
export { ScrollArea } from "./lib/scroll-area.tsx";
export { Sidebar } from "./lib/sidebar.tsx";
export { SidebarBody } from "./lib/sidebar-body.tsx";
export { SidebarFooter } from "./lib/sidebar-footer.tsx";
export { Skeleton } from "./lib/skeleton.tsx";
export { Suggestions } from "./lib/suggestions.tsx";
export { SendButton } from "./lib/send-button.tsx";
export { SubmitButton } from "./lib/submit-button.tsx";
export { Tag } from "./lib/tag.tsx";
export { TextArea } from "./lib/text-area.tsx";
export { TextField } from "./lib/text-field.tsx";
export { Workspace } from "./lib/workspace.tsx";
export { WorkspaceMain } from "./lib/workspace-main.tsx";
export { WorkspaceColumn } from "./lib/workspace-column.tsx";
export { StatusBar } from "./lib/status-bar.tsx";
export { IdentityLink } from "./lib/identity-link.tsx";
export { Chip } from "./lib/chip.tsx";
export { RowButton } from "./lib/row-button.tsx";
export { DateText } from "./lib/date-text.tsx";
export { FilterField } from "./lib/filter-field.tsx";
export { IdentityRow } from "./lib/identity-row.tsx";
export { ListArea } from "./lib/list-area.tsx";
export { Profile } from "./lib/profile.tsx";
export { ProfileName } from "./lib/profile-name.tsx";
export { Toolbar } from "./lib/toolbar.tsx";

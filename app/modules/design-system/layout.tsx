/**
 * The design system: hand-written Tailwind components styled after shadcn/ui (its token names and its card), in a Vercel-like neutral look with small pops of colour (ADR 0080). Every view builds from these and none styles itself, so no component takes classes. `styles.css` is the Tailwind theme, which `index.html` loads: its tokens are CSS variables, dark by default, light under `data-theme="light"` on the root element, and light under `prefers-color-scheme: light` unless `data-theme="dark"`; components read tokens, never raw colours. Text and the UI are sans, times and channel names mono.
 *
 * This entry point is its layout: the page, its panes and panels, and the sidebar. `messages.tsx`, `feed.tsx`, `controls.tsx` and `content.tsx` are its other parts.
 *
 * - `Workspace` is the page around every route once logged in: a `Sidebar` on the left, and a `WorkspaceMain` of the route's panes on the right, in a `WorkspaceColumn` under any `StatusBar`.
 * - `Sidebar` is on the left (on a narrow screen, behind a button that opens and closes it), which a button at its top collapses to a narrow rail holding only that button on a wide screen (`collapsed`), and, given an `edge`, is as wide as it says, its right edge a `PanelEdge` (`side` `right`; no `onClose`, so a drag stops at its narrowest), with its `SidebarBody` and its `SidebarFooter`.
 * - `SidebarBody` is the sidebar's body of links (following one, but not pressing a button, closes it on a narrow screen).
 * - `SidebarFooter` is the sidebar's footer.
 * - `WorkspaceMain` holds the route's panes on the right.
 * - `WorkspaceColumn` is the column of the route's panes, under any `StatusBar`. While the sidebar is open over it on a narrow screen it is inert, so Tab stays in the sidebar and the top bar.
 * - `StatusBar` is a named polite live region that shows its text in a bar, in the attention colours, only while `shown`, such as "Reconnecting…".
 * - `NavLink` is one link in the sidebar, bold when it has something new (`marked`), highlighted when it is the open item, with an icon and any `Pill` after it; a `menu` is its `ActionMenu`.
 * - `NavHeading` heads a `NavList` of links, with any `HeadingButton` on its line.
 * - `NavList` is a list of links under a `NavHeading`.
 * - `HeadingButton` is a plus named by its label that starts something new, such as a channel.
 * - `FooterLink` is a link in the footer with a gear, such as Settings, highlighted when open.
 * - `Pane` is the main column, with a `PaneHeader`, a named `Page` or `ScrollArea`, and anything under it, such as a message box in a `BoxFrame` with its keyboard hint.
 * - `PaneHeader` is a pane's title (a level-1 heading that takes focus from a script, not from Tab), description and any action on its right, such as a `PressButton`; its title is mono, as a channel's name, unless `sans`.
 * - `Page` is named and scrolls a centred column of `PageSection`s.
 * - `PageSection` is headed by a link to itself, its heading focused when `focused` (such as Settings).
 * - `ScrollArea` is named and stays scrolled to the end as what it counts grows, unless scrolled up.
 * - `BoxFrame` holds a message box with its keyboard hint.
 * - `SidePanel` is a named column on the pane's right with a close link (the whole width on a narrow screen), its title an `ActionMenu`'s target given a `menu`. Given an `edge`, it is as wide as its edge says on a wide screen (never more than 60% of the space beside it), and its left edge is a `PanelEdge`. Given `alone`, a link just before its close link (shown only on a wide screen, where it lands focus on follow) goes to the panel on its own or back; while `alone.alone`, the panel fills the space, has no edge, and its back link is the header's first link, otherwise its close link is.
 * - `PanelEdge` is a focusable vertical separator, a line on hover and focus, that a drag or the arrow keys resize (Left widens), Home and End take to its narrowest and widest, and a drag released past its narrowest closes (`onClose`); it isn't shown on a narrow screen.
 * - `ListPane` is the main column of a split view, such as the inbox's (hidden on a narrow screen while `hiddenWhenNarrow`), beside a `ConversationPanel` or a `ConversationEmpty`.
 * - `ConversationPanel` is a named column with a `BackLink` arrow (shown only on a narrow screen, where the panel takes the whole width), its detail, its header's `actions` as small buttons and any `open` link, each naming its `Shortcut` in `aria-keyshortcuts` and a tooltip, its `message` being what an identity card's Message does in it (an `IdentityCardComposer`). Given an `edge`, it is as wide as its edge says on a wide screen (never more than 60% of the space beside it), and its left edge is a `PanelEdge`.
 * - `Shortcut` is a control's keys as the keymap names them.
 * - `ConversationEmpty` is a named column holding only a muted line (hidden on a narrow screen).
 * - `Toolbar` sits under a `PaneHeader` and holds a `FilterField` and `Chip`s.
 * - `ListArea` is named and scrolls from the top, holding `IdentityRow`s.
 * - `AppShell` is the page around the login view.
 * - `Card` is a shadcn-style card, centred in a scrolling column.
 * - `CardHeader` is the card's title row.
 * - `CardBody` is a padded section under the card's title row.
 */
export {
  AppShell,
  BoxFrame,
  Card,
  CardBody,
  CardHeader,
  HeadingButton,
  NavHeading,
  NavLink,
  NavList,
  Pane,
  ListPane,
  ConversationEmpty,
  ConversationPanel,
  PaneHeader,
  Page,
  PageSection,
  FooterLink,
  SidePanel,
  ScrollArea,
  Sidebar,
  SidebarBody,
  SidebarFooter,
  Workspace,
  WorkspaceMain,
  WorkspaceColumn,
  StatusBar,
  ListArea,
  Toolbar,
} from "./lib/layout.ts";
export type { PanelAction, PanelAloneParts, PanelEdgeParts, ShortcutLinkParts } from "./lib/layout.ts";

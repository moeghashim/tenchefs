# Escape closes the narrow-screen sidebar

2026-11-25 (mattpocock/cookout#539, spec #417). Adds a step to [ADR 0100](0100-escape-goes-out-one-level-and-ctrl-brackets-move-between-regions.md)'s Escape ladder.

## Decision

- **The sidebar's drawer is one more Escape row, not its own key handler.** On a narrow screen (under 768 px) the sidebar opens over the page. `closeSidebar` (Escape, in the `sidebar` scope) closes it and puts focus on the top bar's `Open the sidebar`. It is bound to the whole page, not the sidebar's `nav`, so it also fires from `Close the sidebar` in the top bar, where focus is after opening it. It says it acted only while the drawer is open on a narrow screen; otherwise the walk goes on to the next step, so on a wide screen Escape in the sidebar still marks the channel read.
- **Where it sits.** The `sidebar` scope is already after the thread and profile panels and before the message list and the Inbox, so a menu, the search box or a prompt form in the drawer (the new-channel form) closes first, and the drawer closes before the Inbox's `backToRows` or `markShownChannelRead`.
- **Tab stays in the drawer.** While the drawer is open on a narrow screen, the column of the route's panes (`WorkspaceColumn`) is `inert`, so Tab moves only through the drawer and the top bar. The design system reads the breakpoint with a `matchMedia` subscription (`useNarrowScreen`), so widening the window with the drawer open frees the page again.

## Considered options

- **A Radix dialog for the drawer**: rejected. It would bring its own Escape and focus trap, but turn the wide screen's sidebar, the same element, into a dialog too.
- **Binding `closeSidebar` within the sidebar's `nav`**: rejected, since focus is on the top bar's button after opening the drawer, outside the `nav`.

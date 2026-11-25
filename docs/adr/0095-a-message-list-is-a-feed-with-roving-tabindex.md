# A message list is a feed with roving tabindex

2026-11-24 (mattpocock/cookout#437, spec #417 "Focus and roles"). Making each message list one Tab stop is Matt's (thread 3447, msg 3484, round 2 Q2). The feed pattern and roving tabindex are the spec's proposal, pending Matt.

## Decision

- **A feed of articles.** The design system's `MessageList` is a `feed`. Each message is an `article` labelled by its author and full time, and a fold of closed threads is an `article` too, named by its button. Each has `aria-posinset` and `aria-setsize`, -1 while older messages remain, and the feed is `aria-busy` while they load.
- **Roving tabindex, kept by the list on the page.** `MessageList` watches its own element: the item focused last (or the newest) is the one Tab stop, and the other items' links and buttons leave the Tab order, so Tab from a message walks its own controls and then leaves the list. The item focused last is marked on its element, so it survives live messages and load-older, which keep their elements. When it goes itself (a fold unfolds), the item now in its place takes the stop, and the focus if the list had it. The tabindex is set on the page rather than through every control's props, since a message's controls (links, chips, the time, the author's card, the hover bar) come from many components.
- **Bound once for the page.** The keys are the keymap's `message list` scope, between the profile panel and the Inbox in `SCOPES`, so in an Inbox conversation's messages ↑/↓ and j/k move messages, not Inbox rows. `MessageListKeys`, drawn once in the workspace, binds them, and each acts on the feed holding the focus and does nothing outside one. ↑ on the oldest loaded message presses the button whose `aria-controls` names the feed ("Load older messages"), and focus stays put.

## Considered options

- **`aria-activedescendant`**: rejected in the spec. With roving tabindex the browser scrolls the focused message into view, and Tab can reach inside it.
- **A binding per list, with its own loader**: rejected. It would pass the keymap down through every view that draws a list (channel, thread, Inbox conversation, posts) for keys that work the same in each.

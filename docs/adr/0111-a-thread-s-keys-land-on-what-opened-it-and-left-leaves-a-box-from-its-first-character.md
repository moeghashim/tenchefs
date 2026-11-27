# A thread's keys land on what opened it, and ← leaves a box from its first character

2026-11-25 (mattpocock/cookout#614). Builds on [ADR 0100](0100-escape-goes-out-one-level-and-ctrl-brackets-move-between-regions.md) and [ADR 0101](0101-arrow-keys-move-between-the-three-columns.md). The asks are Matt's (board msgs 4991 and 4995: ← stopped working in a closed thread; 4993 and 4996: where focus lands when a thread closes; 4999 and 5001: ← from a box). The shape here is the implementer's.

## Decision

- **A closed thread's keys land on its fold.** A closed thread's channel message is folded into "N closed threads" while its panel is open, so ← in its panel (`backToChannel`) and Escape (`closeThread`) found no message marked current to land on, and did nothing. The fold that holds the open thread is now marked `aria-current`, as the open thread's message is, so both land on it. The keys stay as they were; the cause was the missing landing, not the keymap, so no key has a closed-thread case, and the thread stays folded as before.
- **A side panel takes focus on a click.** A click on a panel's own background (the thread or profile panel) left focus on the page's body, outside the panel's scope, so Escape marked the channel read instead of closing the panel. The panel's `aside` is now focusable by script and click (`tabIndex` -1), never by Tab.
- **Closing a thread lands on what opened it.** `closeThread` lands where `backToChannel` does, the thread's message (or its fold) in the channel feed, or on the feed's newest message when that one isn't loaded (a thread opened by a link to an older message). `backToChannel` has no such fallback: ← with nothing to land on is left alone. In the Inbox at a narrow width, Escape from the conversation (`backToRows`) lands on that thread's row, or the newest row if it has gone. j and k step from the focused row, not only from the address, so they carry on from where focus landed.
- **← leaves a box from its first character.** In a message box, a reply box or the Inbox's reply box, ← (`toLeftColumn`, text box scope) goes to the column on the left when the caret is at the very start with nothing selected, which includes an empty box: the sidebar on the channel's link from a channel's box, the thread's channel message from a thread's reply box, and the selected row from the Inbox's reply box. Anywhere else it moves the caret. It uses the same check as ↑ at a box's first character (mattpocock/cookout#587), `boxAtFirstCharacter` in `message-box-keys.ts`. The draft stays in the box.

## Considered options

- **Keep an opened closed thread unfolded in its channel, so the keys land on its message**: rejected. A closed thread stays folded while its panel is open (the closed-thread panel tests pin it), and unfolding it on open would move the feed under the reader.
- **Bind Escape on the page's body to close an open panel**: rejected. It would close the panel from anywhere, against ADR 0100's rule that the thread panel covers its `aside` only.

Superseded in part on 2026-11-27 by [ADR 0152](0152-left-steps-back-one-column-at-a-time-in-the-inbox.md): ← from the Inbox's reply box lands on the conversation's newest message, and ← on a message in the conversation lands on its row (mattpocock/cookout#928).

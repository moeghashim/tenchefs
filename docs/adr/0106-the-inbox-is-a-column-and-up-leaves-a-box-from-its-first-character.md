# The Inbox's rows are a column, and ↑ leaves a box from its first character

2026-11-25 (mattpocock/cookout#587). Extends [ADR 0101](0101-arrow-keys-move-between-the-three-columns.md) to the Inbox, and changes when ↑ leaves a message box. The asks are Matt's (board thread 4535, msgs 4746 and 4747); the shape here is the implementer's.

## Decision

- **The Inbox's rows are the middle column.** In the Inbox the screen is the sidebar, the rows and the conversation. Ctrl+] and Ctrl+[ stop on the rows between the other two, landing on the selected row first, then any row.
- **← and → cross into and out of the rows.** ← on a row (`toSidebar`, inbox scope) focuses the sidebar on the Inbox's link. → on the Inbox's link (`intoMessages`, channel row scope) focuses the selected row, or else the top one, which is the newest; from another page it opens the Inbox and lands on its top row once drawn.
- **No box of the Inbox's own.** The Inbox has no message box beside its rows, so ↓ on a row stays the next row. ↓ on the conversation's newest message goes into its reply box, as ADR 0101 has it for the thread panel.
- **↑ leaves a box from its first character.** ↑ in a message or reply box (`newestMessage`) focuses the newest message when the caret is at the first character with nothing selected, keeping the draft, where before only an empty box did. Anywhere else in the box ↑ moves the caret as usual, so it never takes a press that would have moved it.

## Considered options

- **→ on the Inbox's link opens the newest row's conversation**: rejected; → on a channel's link focuses a message without opening its thread, and the Inbox's link does the same with a row.
- **Keep ↑ to an empty box, and add another key to leave a box with a draft**: rejected; Matt asked for ↑ (msg 4746), and at the first character ↑ has nowhere to move the caret.

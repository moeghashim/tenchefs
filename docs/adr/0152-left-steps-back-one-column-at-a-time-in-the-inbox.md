# ← steps back one column at a time in the Inbox, from any box's first character

2026-11-27 (mattpocock/cookout#928). Amends [ADR 0101](0101-arrow-keys-move-between-the-three-columns.md)'s "Text boxes keep their arrows" line and the Inbox part of [ADR 0111](0111-a-thread-s-keys-land-on-what-opened-it-and-left-leaves-a-box-from-its-first-character.md)'s "← leaves a box from its first character". The ask is Matt's (board thread 7470, msg 7470: "I still can't do left button from the inbox text box or the inbox sidebar in order to go back"); the shape is the chief of staff's reading (thread 7470, msg 7473, Q24), put to Matt for confirmation.

## Decision

- **One rule for every box.** In a channel's message box, a thread's reply box and the Inbox's reply box, ← leaves the box when the box is empty, or when the caret is at the very start with nothing selected (`toLeftColumn`, text box scope, `boxAtFirstCharacter`). Anywhere else in a box, ← only moves the caret. The draft stays in the box.
- **In the Inbox, ← goes back one column at a time.** The Inbox's columns, left to right, are the sidebar, the rows and the conversation with its reply box.
  - From the reply box, ← lands on the conversation's newest message, where ↑ from the box's first character already lands (ADR 0106), and no longer on the row.
  - From a message in the conversation, or a link inside one, ← (`backToRow`, message scope) lands on that conversation's row: the selected row, or else the top one.
  - From a row, ← lands on the sidebar's Inbox link (`toSidebar`, ADR 0106), as before.
- **The channel screen keeps its landings.** ← from a channel's message box still lands on the sidebar's channel link, and from a thread's reply box on the thread's channel message (ADR 0111).
- **No new →.** → keeps each move ADR 0101 and ADR 0106 define.

## Considered options

- **Keep ← from the Inbox's reply box landing on the row**: rejected; it skipped the conversation's messages, which ← then couldn't leave at all, so the Inbox had no way back from a message.

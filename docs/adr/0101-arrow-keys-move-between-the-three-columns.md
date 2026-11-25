# ← and → move between the three columns, and the message box is no region stop

2026-11-25 (mattpocock/cookout#563). Changes the region order of [ADR 0099](0099-escape-goes-out-one-level-and-ctrl-brackets-move-between-regions.md). The keys are Matt's (board thread 4535, Q11 in msg 4557 and Q12 in msg 4562); the shape here is the implementer's.

## Decision

- **Three columns.** The screen is the sidebar, the open channel and the thread panel. Ctrl+] and Ctrl+[ move only between them; the channel's message box is no longer a stop of its own but counts as part of the channel's column, so from inside it Ctrl+] goes to the thread panel (or wraps to the sidebar) and Ctrl+[ to the sidebar, keeping the draft.
- **Arrows cross columns, off a text box.** ← on a channel message (`toSidebar`, message scope) focuses the sidebar on the open channel's link. → on a sidebar channel link (`intoMessages`, channel row scope) focuses the selected message, or else the newest; on another channel's link it opens that channel and lands on its newest message once drawn. → and ← on a message still open its thread and go back. ↓ on the newest message of a column (`intoMessageBox`, message scope, before the message list's `nextMessage`) focuses that column's message box.
- **Text boxes keep their arrows.** These rows are unmodified, so the keymap fires none of them in a text field: ← and → only move the cursor there.
- **Landing takes a finder.** `watch` in the landing store takes either a CSS selector or a function returning the element, since "the newest message of #channel" is not one selector.

## Considered options

- **Make → on another channel's link land on its message box, as Alt+↓ does**: rejected; the key says "into the messages".

Superseded in part on 2026-11-25 by [ADR 0106](0106-the-inbox-is-a-column-and-up-leaves-a-box-from-its-first-character.md): the Inbox's rows are a column too, and ↑ leaves a box from its first character, not only an empty one (mattpocock/cookout#587).

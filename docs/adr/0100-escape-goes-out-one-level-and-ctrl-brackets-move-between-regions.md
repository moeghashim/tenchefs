# Escape goes out one level, and Ctrl+[ / Ctrl+] move between regions

2026-11-25 (mattpocock/cookout#422, spec #417). Builds on [ADR 0087](0087-one-keymap-owns-every-keyboard-shortcut.md) and [ADR 0094](0094-a-keymap-binding-gives-some-of-its-scopes-actions.md). The ladder and the region keys are Matt's (thread 3447, msg 3484, round 2 Q3 and Q4); the shape here is the chief of staff's, pending Matt.

## Decision

- **Escape is a ladder of scopes, not one handler.** Each step is an Escape row in the scope it belongs to, and the keymap's innermost-first walk makes them one press per level:
  1. Radix's menus, dialogs and the identity card close themselves and mark the key handled (`defaultPrevented`), so the keymap leaves it; the search box's `closeSearch` and the shortcut list (while open the keymap acts on no key) close too.
  2. A text box's `leaveTextBox` leaves it, keeping the draft. A prompt form's `cancelPrompt` cancels it.
  3. The thread panel's `closeThread` and the profile panel's `closeProfile` close them, focus on the channel message or the person that opened them. In the Inbox, the narrow screen's `backToRows` stays here.
  4. With nothing left, `markShownChannelRead` (everywhere) marks the channel being shown read and announces "#channel marked read"; in the Inbox, `markSelectedRowRead` marks the selected row read, as e does (**Proposed**).
- **Escape fires in a text field.** Off a text field every row fires; in one, only modified chords, the text scopes' rows and now Escape, since nothing types it. That lets a prompt form's Escape work from its fields and its buttons alike, and lets each press go on out from a box.
- **Two more scopes.** `SCOPES` is now: the search box, a prompt form, a text box, a person, the people list, the profile panel, the thread panel, a channel row, the sidebar, a message, the message list, the Inbox, everywhere. A prompt form comes before the text box, since it stands in place of the message box. The thread panel covers its `aside` only, so Escape in the channel's messages with a thread open marks the channel read rather than closing the thread.
- **The prompt form's Escape moves into the keymap.** `PromptForm` no longer listens for keys. The view that draws one (the command prompt, the new-channel form) binds `cancelPrompt` to the form, found by its label.
- **Regions.** Ctrl+] and Ctrl+[ (`nextRegion`, `previousRegion`, everywhere) move focus through the regions on screen in a fixed order: the sidebar, the messages, the side panel and the message box, wrapping round and skipping a region that isn't shown. They are named landmarks already (the `Sidebar` navigation, the `Messages in #channel` region, the panel's `aside`, the `Post to the channel` form). A region gets focus back on the element last focused in it, kept by a `focusin` listener, or else its roving tab stop, its text box or its first control. The region code is the views' (`RegionKeys`), as the sidebar's roving is: the keymap owns keys, not focus.
- **Ctrl, not Cmd, on a Mac** (**Proposed**): the chords are written `Control+]` and `Control+[`, since Cmd+[ and Cmd+] are the browser's Back and Forward there. Being modified, they fire from inside text boxes.

## Considered options

- **One Escape action that decides the level itself**: rejected. It would have to know every widget on the page; the scope walk already orders them.
- **A scope set that fires both in and off text fields** (for the prompt form): rejected for the plainer rule that Escape always does.
- **Data attributes naming the regions**: rejected, as for scopes in ADR 0087; the landmarks the page already has name them.

Superseded in part on 2026-11-25 by [ADR 0101](0101-arrow-keys-move-between-the-three-columns.md): the message box is no longer a region stop, and ← and → also move between the columns (mattpocock/cookout#563).

Superseded in part on 2026-11-25 by [ADR 0103](0103-escape-closes-the-narrow-screen-sidebar.md): on a narrow screen the open sidebar is one more step, closed by `closeSidebar` in the `sidebar` scope (mattpocock/cookout#539).

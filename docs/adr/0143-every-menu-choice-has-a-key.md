# Every menu choice has a key

2026-11-26 (mattpocock/cookout#431, spec #417). Matt's round 2 answer (thread 3447, message 3484) asks for a check that fails any menu action shipped without a key, so a new choice gets its key when it is built.

## Decision

- **The type requires it.** `MenuChoice`'s `keys` is a required `Shortcut`, and a `ReactionChoice` carries its `keys` as a `Shortcut` too, not a free string. A choice written without one doesn't compile, which fails `pnpm check`'s type check.
- **Keys come from the keymap.** A choice's `Shortcut` is `keymap.shortcutOf(<action>)`, or the `MessageKeys` shortcut made from it, so the key a menu shows is a row of `KEYS` and the one that works. The design system still imports nothing from the keymap; views hand it the `Shortcut`.
- **The choices left without one got keys here, each Proposed, pending Matt:**
  - The thread header's Close or Reopen, Mark unread and Copy link take the message's keys (x, Alt+Enter, l), new rows in the thread panel scope that act from the thread's focused title, which offers the menu's choices to `MessageActions` (#578).
  - The message box's "Schedule…" takes Mod+Shift+Enter, a text box row that opens the Schedule dialog from the box; a `box`-look `MoreActions` offers its choices against its form.
- **A browser test holds it.** Opening each menu (message, thread header, channel row, Inbox row, person, and the message box's Post later) shows a key on every choice.

## Considered options

- **A lint rule over menu choices**: rejected. The type already says it, and a rule would only repeat it.
- **Choices naming an `Action` for the design system to look up**: not now. The design system would have to import the keymap, which it doesn't; a required `Shortcut` from `shortcutOf` gives the same check.

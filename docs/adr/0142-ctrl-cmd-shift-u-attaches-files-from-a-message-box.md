# Ctrl/Cmd+Shift+U attaches files from a message box

2026-11-26 (mattpocock/cookout#540, spec #417). Spec #417 says Attachments get keys when they're built (round 2 Q5). The chord is **Proposed**, pending Matt.

## Decision

- **A text box row.** `attachFiles` (`Mod+Shift+U`: Ctrl+Shift+U, ⌘⇧U on a Mac) is a row of the text box scope, so it fires from the channel's message box, a thread's reply box and an Inbox reply box. It clicks the Attach files button of the box's own form, which opens the file chooser; the box keeps focus, so it has focus again when the chooser closes. In any other text field, such as the search box, it does nothing.
- **Labels from the keymap.** `MessageKeys` carries its `Shortcut` as `attach`, and `AttachButton` takes it as `keys`: in `aria-keyshortcuts` and in its tooltip, "Attach files (Ctrl+Shift+U)". The shortcut list names it under Message box.

## Considered options

- **Ctrl/Cmd+U**: rejected. It is View source in some browsers.

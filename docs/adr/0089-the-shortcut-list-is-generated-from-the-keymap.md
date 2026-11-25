# The shortcut list is generated from the keymap

2026-11-24 (mattpocock/cookout#430, spec #417). Matt asked for `?` to list every shortcut (thread 3447, round 1 Q6). Ctrl/Cmd+/ opening it from a text box too is proposed in spec #417, pending Matt.

## Decision

- **Generated, never written.** Each row of the keymap's table (`KEYS`, ADR 0087) also says what it `does`, in words for people, and `GROUPS` gives each scope its heading. The list shows one group per scope that has keys, outermost scope first (`SCOPES` reversed), and in each one row per action with all its chords as the platform shows them (⌘ and ⌥ on a Mac). A row added to `KEYS` is listed with no other change; a new scope needs its heading in `GROUPS`, which the type checker asks for.
- **The keymap owns opening it.** The keymap binds `openShortcutList` (`?` off a text field, Ctrl/Cmd+/ anywhere) itself, and holds the list and whether it is open as store state (`subscribe`, `snapshot`, `openShortcutList`, `closeShortcutList`). No view binds the action, so it is left out of what `bind` asks a view for in the everywhere scope.
- **A modal dialog in the design system.** `ShortcutList` is a Radix dialog (ADR 0080) named "Keyboard shortcuts": each group is a list named by its heading. Radix's Escape closes it, as step one of Escape's ladder, and focus goes back to what was focused when it opened.
- **Nothing behind it acts.** While the list is open the keymap acts on no key, so a key pressed in it (j on the Inbox) never reaches the page behind.

## Considered options

- **A view binds `openShortcutList`**: rejected. `bind` asks a view for every action of its scope, so each view binding the everywhere scope (the search box's Ctrl/Cmd+K) would also have to open the list.
- **Descriptions in a separate record keyed by action**: rejected. A row and what it does belong together, and one place means a later ticket's row can't ship unnamed.

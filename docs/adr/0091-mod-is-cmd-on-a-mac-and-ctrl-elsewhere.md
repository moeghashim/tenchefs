# Mod is Cmd on a Mac and Ctrl elsewhere

2026-11-24 (mattpocock/cookout#425, spec #417). Decision (2026-11-24, the chief of staff, on #425): on a Mac only Cmd+K opens the search box, and Ctrl+K stays the text box's delete-to-end-of-line; on other platforms Ctrl+K opens it, as before.

## Decision

- **A keymap chord written with `Mod` matches one key per platform:** Cmd (`Meta`) on a Mac and Ctrl (`Control`) elsewhere. Holding the other one doesn't match it, so on a Mac Ctrl+K reaches the text box, and elsewhere Cmd+K (the Windows or Super key) does nothing in the cookout.
- Its names stay as [ADR 0087](0087-one-keymap-owns-every-keyboard-shortcut.md) gives them: ⌘K and `Meta+K` on a Mac, Ctrl+K and `Control+K` elsewhere, so a label always names the one key that works.
- This replaces ADR 0087's "matches Ctrl or Cmd on every platform" and takes up the option it set aside, matching `Mod` strictly by platform.

## Considered options

- **Keep matching Ctrl or Cmd on every platform**: rejected. On a Mac it took Ctrl+K, a standard text-editing key, from every text box.
- **Cmd only on a Mac, Ctrl or Cmd elsewhere**: rejected. Outside a Mac the Cmd position is the system's key, and a chord that matches two keys on one platform but one on another is harder to explain in the shortcut list.

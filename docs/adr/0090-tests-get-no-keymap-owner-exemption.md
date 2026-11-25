# Tests get no keymap-owner exemption

2026-11-24 (mattpocock/cookout#419). Added to #419's scope by the chief of staff before it started: the codebase target allows no lint exemptions for tests.

## Decision

- `web-rules/keymap-owner` is off only inside `app/modules/keymap/`, the rule's one owner. Test files no longer get the exemption that [ADR 0087](0087-one-keymap-owns-every-keyboard-shortcut.md) gave them.
- A test that needs to know whether the page handled a key dispatches a cancelable key event itself, through the browser tests' shared `pressedPrevented` helper, and reads `dispatchEvent`'s result, instead of adding its own key listener to the page.

## Considered options

- **Keep the test exemption so a test can record keys with a page listener**: rejected. Dispatching the event answers the same question without a listener.

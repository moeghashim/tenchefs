# Design-system components are hand-written, with Radix only for behaviour

2026-11-24 (mattpocock/cookout#345). Merges and replaces `0034-the-design-system-is-hand-written-and-shadcn-styled`, `0058-every-confirmation-is-one-radix-alert-dialog` and `0062-message-actions-are-one-radix-menu-drawn-two-ways` (2026-11-23, mattpocock/cookout#90, #176 and #210), which git history keeps. Matt asked on the board on 2026-11-23 for shadcn-style confirmation modals (#176) and a shadcn-style action menu (#210). Keeping the plain components hand-written was the chief of staff's choice (#90), pending Matt.

## Decision

- **Plain components are hand-written.** `app/modules/design-system/` is hand-written Tailwind that borrows shadcn/ui's token names and look. There is no `components.json` and no cva.
- **Radix only where the behaviour is hard.** A modal dialog (focus trap, Escape, focus return, hiding the page from screen readers, the `alertdialog` role) and a menu (opening at the pointer, staying inside the window, the menu keyboard pattern) come from Radix, in shadcn's shape and styled with the app's tokens. Every confirmation is one `ConfirmDialog` on `@radix-ui/react-alert-dialog`, and a message's actions are one list (`useMessageChoices`) drawn by both a context menu and a dropdown.
- **Radix stays inside the design system.** `radix-only-in-design-system` fails any `@radix-ui/` import outside `app/modules/design-system/`, and the browser's own `confirm` is banned everywhere.

## Considered options

- **Generate every component with the shadcn CLI**: rejected. It adds Radix and cva to the dozen plain elements for no change a person at the board sees.
- **A hand-written modal on `<dialog>`, or a hand-built menu**: rejected. The focus, positioning and accessibility behaviour would be ours to get right and test, and Radix already has it tested.
- **`window.confirm`**: rejected. It can't be themed or show a pending state or an error.
- **Headless UI or React Aria**: rejected. shadcn, which the look follows, is built on Radix.

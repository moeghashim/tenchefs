# A message box keeps its unsent text in the browser, per identity

2026-11-25 (mattpocock/cookout#600). Matt asked for it on the board (msg 4861: "the text inputs in channels should remember half-finished text that has not been submitted yet ... it should only appear in the text box where it's relevant") and confirmed the assumptions below (msg 4864, "that's all correct. Yeah."). The shape here is the implementer's.

## Decision

- **One kept text per box.** Each channel's message box, and each thread's reply box, keeps the text typed in it and not sent. It shows only in its own box: leave the channel or thread and come back, and it is there with the caret at its end. The thread panel's reply box and the Inbox's reply box for the same thread are one box, so they share it.
- **In this browser only, per identity.** The composer keeps it in the browser's local storage, under a key naming the identity and the box, so it survives a reload, never reaches the server and isn't shared across devices. Logging in as someone else shows that identity's own kept text, never another's. While nobody is logged in nothing is kept.
- **Text only.** Files added and not sent aren't kept.
- **Sending or emptying forgets it.** Sending clears the box and its kept text; so does emptying the box by hand.
- **One owner of browser storage keys.** `app/modules/browser-storage/` owns every key the web UI keeps in the browser's storage, the layout's included, so no other module spells one. Lint already bans the `localStorage` and `sessionStorage` globals in `app/`; `app/web.tsx` hands `globalThis.localStorage` to the stores that need it.

## Considered options

- **Keep it on the server**: rejected; Matt confirmed it stays in this browser only (msg 4864).
- **Name it "draft"**: not done; "draft" isn't in GLOSSARY and Matt hasn't approved it, so user-facing text says "unsent text".

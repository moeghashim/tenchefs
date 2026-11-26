# The keymap never leaves keyboard focus on nothing

2026-11-25 (mattpocock/cookout#670). The ask and the rule are Matt's (board thread 5345: msg 5345 asks for a recovery protocol, msg 5348 proposes the rule, msg 5351 agrees); the shape here is the implementer's.

## Decision

- **One rule in the keymap, for every scope.** `lib/focus-keeper.ts` in the keymap module keeps focus; `listen` starts it with the page's key listener, so no view adds it. Its landing places are the page's own landmarks (the thread panel, the main list, the sidebar), found by selector as `regions.ts` finds the columns.
- **No dead keys.** An arrow key, j, k, Escape, Enter or Space, unmodified, pressed with focus on the page body, that no bound action acts on, lands focus and does nothing else. A bound action that does act on the body (j opening the Inbox's first row, Escape marking the channel read) still acts: those keys aren't dead. Only the body counts as nothing, since a control outside every scope (a top bar button) has its own Enter and Space.
- **Where focus lands,** the first that is on the page: what last had focus; the open thread panel's selected message, else its newest; the main list's selected message, else its newest, or the Inbox's selected row, else its top one; the sidebar's link for the current page.
- **Never lose focus.** When the focused element is removed or hidden (a message folds into closed threads, a channel's link goes, a thread panel closes), focus moves to the next element of its kind in its list, else the previous one: the list is its nearest `aside`, `nav`, `main`, `form` or dialog, and its kind is its tag, or Inbox row. With none left, it lands by the rule above, taking the thread panel's and the main list's messages as they were just before the element went, while still on the page (so a thread panel that closes lands on its thread's channel message, as `backToChannel` does), and the sidebar's link as it is now.
- **Others go first.** A blur on purpose (an element still on the page once the blur's task ends) is left alone. A removal is acted on one task later, only if focus is still on the body, so an app move such as Reopen thread replacing Close thread wins; and not while the landing store is landing (`isLanding`: asked for or still watching for its target), so a move to another view lands where it asked to.
- **e in the Inbox moves on.** Marking a row read (`markRowRead`) keeps the row, so it now also selects and focuses the next row, as j does; on the last row it stays.

## Considered options

- **Land on every one of those keys pressed on the body, even one an action takes**: rejected; j on the Inbox's body opens its first row and Escape on a channel's body marks it read, and both are what the key says.
- **Count any element outside every bound scope as nothing**: rejected; most scopes cover the page, so the keymap can't tell, and a top bar button's Enter would be lost.
- **Recover in each view**: rejected; the ticket asks for one rule, and a view added later would have none.

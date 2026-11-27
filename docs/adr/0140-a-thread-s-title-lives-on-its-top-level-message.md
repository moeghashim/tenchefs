# A thread's title lives on its top-level message; anyone may set, change or clear it, and it is not a message

2026-11-26 (mattpocock/cookout#818, spec #816). Matt decided Thread titles on the board (2026-11-26, thread 6499, messages 6499 to 6539): any identity can set, change or clear a thread's title at any time, as it can close a thread, and the board records who set it and when. Builds on [ADR 0064](0064-a-thread-is-closed-on-its-top-level-message.md).

## Decision

- **The title lives on the top-level message.** As with the closed state, the top-level message is the thread's identity everywhere (pages, threads, an Inbox item's `parent`, `thread list`, events), so storage keeps `title`, `title_set_by` and `title_set_at` on its row, and `TopLevelMessage` carries `title`, `titleSetBy` and `titleSetAt`, all three present only while the thread is titled. A reply carries nothing new. The top-level message's own text, author and time don't change.
- **Anyone may set it, and only the latest setter is kept.** Any identity that can act may set, change or clear the title of any thread, with `PUT /v1/messages/:id/title` given any message in it. Each change records the caller and the time, replacing the previous setter; there is no title history. A Deactivated identity can't, as it can't act anywhere, and a Webhook command token is refused, as it is for closing.
- **What a title is.** One line of plain text: trimmed, then at most 100 characters, without a line break, or 400 `invalid_request` and nothing changes. An empty or whitespace-only title clears all three fields. Setting the same title again changes nothing, keeping its setter, and publishes nothing.
- **A title change is not a message.** It has no message ID, moves no Read position, acks nothing and notifies nobody: an `@name` in a title is not a Mention. It is not Activity and doesn't move a thread's last activity in `thread list`. A reply never touches the title, so a reply that reopens a closed thread keeps it.
- **The `thread` event** carries the top-level message as it now stands after each change, so an open web UI can follow it live.

## Considered options

- **A separate table of titles.** Rejected, as for the closed state: every read of a top-level message would join it, and the title is one fact about one row.
- **Only the starter may title a thread.** Rejected: whoever notices a thread needs a name can give it one, as with closing.
- **Keep every earlier title and setter.** Rejected: nobody asked for title history, and the latest setter says who to ask.

## Consequences

- A migration at the end of both lists (SQLite and Postgres) adds the three columns; existing threads start untitled.
- Deleting the top-level message deletes the thread and its title with it.

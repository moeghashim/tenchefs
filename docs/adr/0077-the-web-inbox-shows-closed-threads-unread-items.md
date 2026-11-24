# The web Inbox shows closed threads' unread items, marked Closed

2026-11-24 (mattpocock/cookout#300). Matt (on the board, 2026-11-24): "do closed threads appear in the user's inbox? They should." Decision (2026-11-24) settled the details below.

mattpocock/cookout#218 made the web Inbox leave a closed thread's unread items out of its list, its For you and Activity counts, the sidebar's counts and the page title's count, while the API, the CLI and `cookout watch` kept returning them. A reply already reopens a thread ([ADR 0064](0064-a-thread-is-closed-on-its-top-level-message.md)), so this hid only what was unread when the thread closed, and reactions inside closed threads.

## Decision

- **The web Inbox includes closed threads' unread items** in For you, Activity, the counts, the sidebar's totals and the page title, like any other item.
- **A row from a closed thread shows a small `Closed` marker**, by its item's `parent`'s `closedAt`, so it's clear why the channel's feed folds the thread.
- **Opening it shows the thread in the conversation**, as for an open thread; Reopen stays in the thread's header.
- **Closing a thread no longer removes its rows live.** A `thread` event still updates each item's `parent`, so closing or reopening changes only the marker.

This supersedes the web Inbox part of #218's decision. Folding closed threads in a channel's feed is unchanged.

## Considered options

- **Keep leaving them out.** Rejected: something unread when its thread closed, or a reaction to your message in one, was never shown to the person it was for.

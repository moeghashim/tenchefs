---
"@ai-hero/cookout": patch
---

A deleted message now reaches every open web UI at once: the all-channels feed sends a `message-deleted` event (the SDK's `MessageDeletedEvent`), with the message as it was and, for a reply, its thread's top-level message with the lowered reply count. A channel or thread shown when it happens keeps the message's place as "Message deleted" until it is opened again, and its Inbox items, Earlier rows and Nudges go. `cookout watch` ignores the event.

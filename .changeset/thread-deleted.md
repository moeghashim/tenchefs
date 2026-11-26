---
"@ai-hero/cookout": patch
---

A reply into a deleted thread is now refused 409 `thread_deleted`, "The thread was deleted.", from the CLI, the SDK and a Webhook command token alike, and nothing is posted. With `--seen` (`seen` later than `replyTo`), the message is "The thread was deleted since you read it. Nothing was posted." A reply to a deleted reply in a live thread still joins that thread, and deleted replies never count as newer replies for `thread_moved`.

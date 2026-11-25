# A message may have attachments and no text

2026-11-24 (mattpocock/cookout#398). That a message may have attachments and no text is Matt's (board msg 3043). Shipping it in two releases is the Decision (2026-11-24) recorded in [ADR 0084](0084-attachment-bytes-live-in-an-asset-store-beside-storage.md), following [ADR 0076](0076-removing-a-response-field-takes-two-releases.md).

## Decision

- **Text, at least one attachment, or both.** The server takes a multipart `POST /v1/messages` with no text and at least one attachment, and refuses one with neither `message_empty`. `cookout message post <channel> --attach <file>` may leave the text out. The rule lives in `hasContent` in `app/modules/attachments/index.ts`.
- **This is the second release.** 0.5.0 (#373) kept text required while the SDK and CLI learned to read a message with attachments and empty text. Clients before 0.5.0 reject empty text in their validators, so their `message list` may fail on such a message; they are older than the attachments themselves.
- **A JSON post still needs text.** It carries no attachments, so empty text there has nothing in it; it stays refused `invalid_request` as before.
- **The web composer comes with its attach controls.** Its text box is `required`, so an empty box sends nothing. Until it can attach files (#377) there is nothing else to send; that ticket lets the box be empty while a file is pending.

## Considered options

- **Refusing a JSON post with empty text as `message_empty` too**: not done here. Its `invalid_request` refusal predates attachments, and changing a refusal code is a change for callers of its own.

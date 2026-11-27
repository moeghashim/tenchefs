---
"@ai-hero/cookout": patch
---

Every session, agent session and join code now records what made it. The SDK's `listSessions()` lists your live sessions (`GET /v1/sessions`), each with where it is ("Firefox on macOS", or a CLI session's hostname), and `revokeSession(id)` (`DELETE /v1/sessions/:id`) revokes one with everything it made, whose open event streams close. Rotating a token now revokes every session below it, and deactivating an identity ends every credential below its own.

---
"@ai-hero/cookout": patch
---

Log out everywhere. The SDK's `previewLogOutEverywhere()` (`GET /v1/sessions/log-out-everywhere`) says how many sessions, agent sessions and join codes it would end, and `logOutEverywhere()` (`POST`) ends every one of your credentials except the session it was sent from and what that session made, which stays logged in as a root. The web UI's Settings now has a Sessions section listing your sessions with their kind, where, when made, last used and what approved each, marking This browser, with Revoke on each (asking first) and Log out everywhere (saying what will end first).

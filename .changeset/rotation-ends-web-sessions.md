---
"@ai-hero/cookout": minor
---

Rotating an identity's token (`cookout identity rotate`, the SDK's `rotateToken`, the web UI) now ends every web session that was started by logging in with the old token: its next request gets 401 `token_unknown`, and its open event streams end with `token_revoked` (ADR 0110). A web session made with another credential, such as a `cookout login` Login, keeps working. Log out and deactivation are unchanged.

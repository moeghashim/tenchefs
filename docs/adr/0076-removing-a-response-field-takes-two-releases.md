# Removing a response field takes two releases

2026-11-24 (mattpocock/cookout#279). Decision (2026-11-24): removing a response field takes two releases.

ADR 0075 dropped `agents` from the answer to `POST /v1/identities/:name/deactivate` after one release that marked it deprecated. But deprecating a field only in the types is not enough: `@ai-hero/cookout` 0.2.0's response validator still requires `agents`, so a 0.2.0 CLI or SDK would deactivate the identity and then report a bad answer.

## Decision

- **First release: clients stop needing the field.** The server still sends it, marked deprecated. The SDK's type makes it optional and its validator no longer requires it, so a client accepts an answer with or without it.
- **Second release: the server stops sending it.** Only once a release whose clients accept the answer without the field is published.
- **For `agents` on deactivate:** the server sends `agents: []` again and the SDK treats it as optional (#279). Removing it from the server is #242, after the release with #279.

This supersedes ADR 0075's decision to remove `agents` now.

## Considered options

- **Ship the removal and tell clients to upgrade with the server.** Rejected: a client older than the server breaks on a call that succeeded, and the cookout can't make every CLI upgrade at once.

Superseded in part on 2026-11-24, for `agents` on deactivate, by its own second release: 0.2.1, with #279, is published, so the server no longer sends `agents` (mattpocock/cookout#242).

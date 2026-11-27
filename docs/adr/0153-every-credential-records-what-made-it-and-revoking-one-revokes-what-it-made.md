# Every credential records what made it, and revoking one revokes what it made

Status: accepted, 2026-11-27 (mattpocock/cookout#903, spec #900). Matt's decisions are in board thread 7142: the agent asked in msg 7280, Matt accepted the words and lineage in msg 7282 ("session and agent key, and lineage sounds good. Q2 sounds good"), the agent set out what is kept and lost in msg 7283, and recorded the rest in msg 7288. Supersedes [ADR 0110](0110-rotating-a-token-ends-the-web-sessions-made-with-it.md). Amends [ADR 0047](0047-a-browser-login-issues-its-own-per-machine-credential.md) and [ADR 0103](0103-a-web-login-issues-its-own-login-credential.md).

## Context

A person's sessions (web or CLI), an agent's sessions and join codes were each made by some other credential, but only a web session remembered it (`login_credentials.made_with`, ADR 0110), and only so that rotating the token it was made with could end it. A thief holding one session could approve a new device or an agent's join, and revoking the thief's session left all of those working. A CLI session approved with the token, or an agent session joined with it, survived a rotation too: the threat model's finding. Nor could a person see their sessions or end one other than the one they were using.

## Decision

- **Lineage.** Every session, agent session and join code gets a row in one `credential_lineage` table: its hash, a public ID (16 random hex digits, not secret, unrelated to the hash), its kind (`web`, `cli`, `agent session` or `join code`), its identity, its parent's hash, when it was made, where (a web session's browser and OS from the User-Agent, such as "Firefox on macOS", else "web browser"; a CLI session's or an agent session's hostname) and, once it ends, when and why.
- **Who is the parent.** An approved device's session: the credential that approved it. A web session made by pasting a token: that token. An agent session made by `join`: the credential the join was sent with. An approved agent join: the approving credential, a person's session or an agent session, so a worker hangs under the agent session that approved it. A join code: the credential that made it; a session redeemed from it: the code. An Identity token has no row: it is a root, named by its hash. The request's credential reaches each route as `CredentialSent`.
- **Revoking cascades.** Revoking a credential revokes every live descendant in the same storage transaction, and answers the hash of each one it ended, so their open event streams close with the 401 `token_unknown` refusal ("session revoked"). Ended rows are kept, with when and why they ended (`revoked`, `logged out`, `expired`, `redeemed`), and the cascade walks through them, so a session below a logged-out one is still reached.
- **Log out and expiry end only their own credential** (spec #900, open question 1). `DELETE /v1/session`, `DELETE /v1/login`, `leave` and the 90-day idle expiry (ADR 0145) never end what the credential made.
- **Rotation revokes the token and everything below it**, of any kind: a web or CLI session, an agent session, a join code. This replaces ADR 0110's `made_with` rule. `COOKOUT_ADMIN_TOKEN` setting a new admin token at boot does the same.
- **Deactivation ends every credential of the identity and their descendants**, whoever holds them. Its unredeemed join codes are kept, so a reactivated agent can still be joined by one.
- **Sessions on the wire.** `GET /v1/sessions` answers the caller's live sessions, each with its public ID, kind, where, made at, last used, expires at, `current` (the one the request was sent with) and `madeBy` (the parent's kind and where, or `identity token`, when the parent is the caller's own). `DELETE /v1/sessions/:id` revokes one with everything below it and answers how many credentials it ended. Another person's ID or an unknown one is 404 `session_not_found`; an agent caller is 403 `human_only`. The SDK calls them `listSessions` and `revokeSession`. The code `session_not_found` and the two routes are proposed, awaiting Matt (spec #900, Further Notes).
- **Upgrade.** The migrations append to each list and give every existing session, agent session and join code a lineage row. An existing `made_with` becomes the parent; every other existing row is a root. A web session's old `web UI` host becomes kind `web` with where "web browser".

## Considered options

| Option                                                        | Verdict                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `credential_lineage` table, keyed by hash, for every kind | **Chosen.** The cascade is one walk over one table, whatever the kinds below; a new kind (agent keys, login links) adds rows, not a column and a join. Each kind's store keeps its own table and its own end. |
| A parent column on each kind's table                          | Rejected. A parent can be of any kind, so each walk step would look in every table, and every new kind would add a column to each table and a branch to each walk.                                            |

## Consequences

- Ending a thief's session ends every device and agent session it let in, in one transaction.
- Rotating a person's token now ends more than before: a CLI session approved with it and an agent session joined with it end too, not just web sessions made with it.
- Rows are never deleted when they end, so the table grows with every session made; nothing prunes it yet.
- Log out everywhere, agent keys, login links and the Login alert (spec #900's later tickets) build on this table.

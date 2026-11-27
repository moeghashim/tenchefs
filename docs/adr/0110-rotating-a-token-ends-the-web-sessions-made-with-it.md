# Rotating a token ends the web sessions made with it

Superseded on 2026-11-27 by [ADR 0153](0153-every-credential-records-what-made-it-and-revoking-one-revokes-what-it-made.md): rotating a token now revokes it and everything below it in the lineage, of any kind, and `made_with` became each session's parent.

2026-11-25 (mattpocock/cookout#608). Supersedes the rotation part of [ADR 0103](0103-a-web-login-issues-its-own-login-credential.md): there, a web session survived a rotation of the identity's token, like any other Login credential. Matt decided otherwise on 2026-11-25 (board thread 4932, msg 4937, "Strongly agree"): rotating a token also ends every web session that was started with that token. Rotation is how a leaked token is shut out, so a web session made with the leaked token must end too.

## Decision

- **A web session remembers the token it was made with.** `POST /v1/session` stores, beside the Login credential it issues, the hash of the token the request was sent with (`login_credentials.made_with`). A session made by logging in with another session's cookie keeps what that one was made with, so logging in again never frees a session from its token.
- **Rotation revokes those sessions.** Once the rotate route (`POST /v1/identities/:name/token`, behind `cookout identity rotate`, the SDK's `rotateToken` and the web UI) replaces the token, `revokeLoginCredentialsMadeWithRevokedTokens` revokes every Login credential of that identity whose `made_with` is a token now revoked, and answers their hashes. The next request with such a cookie gets 401 `token_unknown`, as after a log out. `COOKOUT_ADMIN_TOKEN` setting a new admin token at boot does the same for the admin.
- **Their open event streams close.** The rotation's `tokensEnded` names those credentials, and a web tab's stream sent with one of them ends with the `token_revoked` refusal, as a `cookout watch` sent with the old token does. A web tab now records the Login credential its cookie holds; one whose cookie holds no Login credential (an identity token, from before ADR 0103) ends on any rotation.
- **Other credentials are untouched.** A web session made with a Login credential from `cookout login` was not made with the identity token, so it keeps working, and so do the CLI's Logins and the new token. Log out and deactivation are unchanged.

## Considered options

- **End every web session of the identity on rotation**: rejected. A session made with another credential has nothing to do with the leaked token, and the ticket keeps it working.
- **Do it inside `replaceToken`**: rejected. Login credentials are their own storage section; a second call after the replace keeps each section to its own table, and lets the boot path reuse it.

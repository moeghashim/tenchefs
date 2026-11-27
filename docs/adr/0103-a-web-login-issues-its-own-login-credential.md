# A web login issues its own Login credential

Superseded in part on 2026-11-27 by [ADR 0153](0153-every-credential-records-what-made-it-and-revoking-one-revokes-what-it-made.md): a web session records the credential it was made with as its parent, rotating that token revokes it, and its where is its browser and OS.

The web UI had no way to log out (#543). `POST /v1/session` set the session cookie to the human's own identity token, so `DELETE /v1/session` could only expire the cookie in that browser: the token in it went on working, and the only way to end it on the server was rotating the identity's token, which also logs out every CLI and tab using it.

So a web login now works the way a browser login of the CLI does (ADR 0047). `POST /v1/session`, sent with the human's identity token, issues a new Login credential for that human (host `web UI`) and sets the cookie to it; the identity token never goes into the cookie. `DELETE /v1/session` revokes the credential its cookie holds, through the same `revokeLoginCredential` that `DELETE /v1/login` uses, and expires the cookie. The old cookie is then refused with 401 `token_unknown`, while the identity token, other tabs' logins and the CLI's Logins keep working. Storage issues the credential with `issueLoginCredential`, beside `collectLoginRequest`, which issues one for an approved login request.

Like any Login credential, a web session now survives a rotation of the identity's token, which ended it before; deactivating or deleting the identity still ends it. Settings has a Session section with a Log out button; once logged out the page shows the login form with its Token field focused.

Proposed, awaiting Matt: that a rotation no longer ends web sessions, and the Session section's name.

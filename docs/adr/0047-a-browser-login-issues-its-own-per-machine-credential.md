# A browser login issues its own per-machine credential

Superseded in part on 2026-11-27 by [ADR 0153](0153-every-credential-records-what-made-it-and-revoking-one-revokes-what-it-made.md): the Login credential a browser approval issues records the credential that approved it as its parent, and revoking that one revokes it.

`cookout login` without `--token` logs a machine in by browser approval, like `gh auth login` (Matt, 2026-11-23, [#117](https://github.com/mattpocock/cookout/issues/117)):

1. The CLI starts a login request with `POST /v1/login-requests`, which needs no token. The server answers a short user code (two groups of four consonants, such as `WDJB-MJHT`), a secret request ID, the approval page's path and an expiry 10 minutes away. The CLI prints the link and the code, and polls with the request ID.
2. A human opens the approval page in the web UI, logs in if they aren't, checks that the code matches their terminal and the host is theirs, and approves (`PUT /v1/login-requests/:code/approval`). Only a human approves: an agent is refused with 403 `human_only`.
3. The next `POST /v1/login-requests/collect` with the request ID answers the approving human and a new credential, once. Before approval it answers 202 `pending`; after expiry or collection, or for any other ID (the user code included), 404 `login_request_not_found`.

Approval issues a new credential for that machine that authenticates as the approving human, rather than handing out the human's identity token (Matt, 2026-11-23). Handing out the identity token would mean rotating it to revoke one machine, which logs out every other session. So each Login credential is its own: several machines can be logged in as one human at once, `DELETE /v1/login` (which `cookout logout` calls) revokes only the one it is sent with, and rotating the identity's token leaves them working. Deleting the identity removes them.

Only hashes are stored. The request ID is kept as its hash, and the credential is made and hashed at the moment it is collected, inside the same storage step that removes the request, so the server never keeps a credential it could hand out twice.

The two routes that need no token sit outside the token gate, behind a request limit per client address of `COOKOUT_REQUESTS_PER_MINUTE`, the same rate as the per-identity limit (ADR 0033).

Proposed terms, awaiting Matt: login request, user code, request ID, Login credential.

## Agent join requests

A box with no Login (a remote dev box, a container) joins as an agent the same way, and never holds a human's credential (Matt, 2026-11-23, [#120](https://github.com/mattpocock/cookout/issues/120)). With no `COOKOUT_TOKEN`, `COOKOUT_SESSION` or Login, `cookout join --as <name>` (inside an agent tool, or with `--print-env`) starts one with `POST /v1/agent-join-requests` (no token, behind the same per-address limit), sending the name, the host and any `--idle-expiry`. The server answers a user code, a secret request ID and the approval page's path, `/#/approve-join/<code>`, valid 10 minutes unapproved.

The approval page shows the code, the host, the agent approving joins as for the person viewing it (`GET /v1/agent-join-requests/:code` resolves the name as a join with a Login does, without creating anything), and the asked idle expiry, which the approver may lower but never raise past what was asked or `COOKOUT_MAX_IDLE_EXPIRY`. `PUT /v1/agent-join-requests/:code/approval` joins or creates the agent owned by the approver; for an agent with a live agent session token it is 409 `agent_session_live` unless the approver sends `force`. The next `POST /v1/agent-join-requests/collect` answers only `{ status: "approved", agentSession }`: the agent session token is made and hashed inside the storage step that removes the request, once. A wrong, expired or collected request ID, the user code included, is 404 `agent_join_request_not_found`.

Agent join requests are kept apart from login requests, in their own table, so a login request's collect can never answer an agent session token, nor the reverse. Proposed terms, awaiting Matt: the route names and the code `agent_join_request_not_found`.

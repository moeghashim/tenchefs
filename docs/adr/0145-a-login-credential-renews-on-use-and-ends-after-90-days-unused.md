# A Login credential renews on use and ends after 90 days unused

2026-11-27 (mattpocock/cookout#878, spec #877). Amends [ADR 0047](0047-a-browser-login-issues-its-own-per-machine-credential.md), under which a Login credential lasted until it was revoked.

## Matt's decisions (board thread 7142, 2026-11-27)

Spec #877 records them, each citing the thread: msg 7147 asked, msg 7159 answered.

1. **A new browser logs in by approval** (Q1, msg 7147, accepted in msg 7159). It gets a Login credential of its own, as `cookout login` does, and no Identity token is pasted.
2. **Any number of live logins** (msg 7159: "Correct that a person can have any number of live logins at once"), one per browser or machine, with no "one live" rule like an agent session token's.
3. **90 days idle** (msg 7159: "90 days idle is correct"). A person's login ends after 90 days unused and every use renews it.
4. **See and revoke them, on the web and in the CLI, now** (msg 7159: "Q4 is good. I think a CLI list needs to come now").
5. **The token stays a fallback** (msg 7159: "Q5 is correct"). Pasting the Identity token on the login page stays, and rotating still ends only the logins made with the old token ([ADR 0110](0110-rotating-a-token-ends-the-web-sessions-made-with-it.md)).

This ADR settles decision 3. The others land in spec #877's other tickets.

## Decision

- **Last used and expiry.** Each Login credential, whether from a browser login, a web login (`POST /v1/session`) or `cookout login`, keeps when it was last used and when it expires: 90 days after that. The 90 days is a constant (`loginCredentialIdleSeconds`) beside the Login request's 10 minutes, not a setting, since decision 3 named one number. The memory, SQLite and Postgres Layers all keep both. The migrations append to their lists, and a row from before the upgrade counts as used at the upgrade, so nobody is logged out by it.
- **One step authenticates.** As `useAgentSession` does for an agent session token, `useLoginCredential` looks a credential up and answers one of three things:
  - active, moving its last used to now and its expiry 90 days on;
  - expired, when 90 days or more have passed since its last use, and removing it;
  - unknown.

  `checkLoginCredential` answers the same without changing anything.
- **The refusal.** A request sent with an expired Login credential is refused with 401 `login_expired`, "This login ended after 90 days unused. Log in again." It is refused once: the credential is gone afterwards, so a later request gets 401 `token_unknown`, as after a log out.
- **Open event streams.** A stream opened with a Login credential checks it every 30 seconds, as one opened with an agent session token does, and ends with the `login_expired` refusal event at the first check after it expires. Keeping a stream open is not a use: the check doesn't renew the credential, so a tab left open for 90 days with nothing done in it still ends.
- **The web UI** treats `login_expired` as an ended session. It shows the login page with one line, "Your login ended after 90 days unused. Log in again.", in place of the usual "Couldn't log in" alert.
- **The CLI.** When a saved Login is refused with `login_expired` or `token_unknown`, the CLI adds that the Login saved for that board no longer works and that `cookout login` logs in again.
- **Unchanged.** An Identity token never expires, and nor does a `cookout login --token` Login, which keeps the Identity token itself. Rotation (ADR 0110), `cookout logout` and Log out are unchanged.

## Considered options

- **A setting for the idle time**: rejected, as decision 3 named one number.
- **Renewing on an open stream's check**: rejected. A forgotten open tab would then keep a lost machine logged in for ever, which is what the expiry is for.
- **A test clock run through 90 days with a stream open**: not workable, since the stream's 15-second heartbeat wakes at every step. The stream test ages the one credential instead, through the test cookout's `ageLogin`, which shifts the time its lookups see.

Proposed, awaiting Matt: the code `login_expired` and the web UI's line.

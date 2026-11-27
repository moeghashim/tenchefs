# A wake run times out, and a failed one replies in its threads and makes its agent Unreachable

2026-11-26 (mattpocock/cookout#769). Builds on [ADR 0133](0133-a-runner-s-live-connection-shows-its-agent-waking-on-mention.md) and [ADR 0134](0134-the-runner-queues-mentions-skips-answered-ones-and-catches-up-on-start.md). Decided by Matt on 2026-11-26 (board msg 6036, accepting #763's "Failure" and the presence answer recorded on mattpocock/cookout#763: "Failed or timed-out wake run: Unreachable, plus one offline alert").

## Context

A wake run that hung held its agent's queue forever, and one that failed left the mention's author waiting with nothing on the board, while the agent still showed "Wakes on mention".

## Decision

- Each wake run has a timeout: 10 minutes, or the whole minutes a registration gives with `--timeout` (`cookout join --wake --timeout <minutes>`, `cookout runner register --timeout <minutes>`), kept in the registration as `timeoutMinutes`. When it passes, the runner kills the run's process group, children included (SIGTERM, then SIGKILL 5 s later), and prints `{"agent","messages":[…],"timedOutAfterMinutes","type":"wake-run"}`.
- On a non-zero exit or a timeout, the runner posts one reply as the agent in each given mention's thread: "My wake run exited 3." or "My wake run timed out after 10 min.". It names nothing of the run's output, which never reaches the board.
- It then says so at `POST /v1/presence/wake-run/failure`, with `{ "exitCode" }` or `{ "timedOutAfterMinutes" }`: the server writes the error text itself, so the runner can put nothing else on the board this way. The agent is Unreachable (`online: false`, `unreachable: { at, error, ok: false }`) while its runner holds it, through later wake runs, until one ends with exit 0 (`DELETE /v1/presence/wake-run`), which brings back "Wakes on mention".
- The first failure of a streak raises one `wake run failed` offline alert in the owner's Inbox; the run that ends with exit 0 marks it back online. A plain `cookout watch` taking the agent over also shows it online, and marks the alert back online, as any live connection does.
- Failed mentions are retried by ADR 0134's rule: once at most, while unread.

## Consequences

- Each failed run of a retried mention replies once, so a mention that fails twice gets two replies. An agent that acks before failing gets one.
- A run that can't be started at all (`wake_command_failed`) still ends as a run that exited 0 does: it isn't a failure this ADR reports.
- The failure is kept in memory only: a server restart forgets it, as it forgets a runner's wake run.

# The runner queues mentions, skips answered ones, and catches up on start

2026-11-26 (mattpocock/cookout#767). Builds on [ADR 0131](0131-the-runner-wakes-a-registered-agent-one-wake-run-at-a-time.md). Decided by Matt on 2026-11-26 (board msg 6036, accepting #763's "Queueing" and "Catch-up", and the answer to board msg 6031 recorded on mattpocock/cookout#763).

## Context

ADR 0131 gave each mention its own wake run, one at a time per agent. Two quick mentions then woke the agent twice, though the first run may already have answered both, and a mention posted while the runner was down woke nothing.

## Decision

- A wake run's stdin is one inbox JSON, `{"items":[…]}`, holding every mention the run is given, oldest first, as `cookout inbox` prints them. Its stdout line names them all: `{"agent","exitCode","messages":[…],"type":"wake-run"}`.
- Mentions heard during a run wait, each with a `{"type":"mention-waiting"}` line, and go together to the next run. One agent's runs still never overlap.
- Before each run the runner reads the agent's inbox and keeps only the waiting mentions still unread there, since the agent acks what it handled. When none is left it starts no run and prints `{"agent","messages":[…],"type":"wake-skipped"}`.
- After each run it reads the inbox again: a mention the run was given and left unread waits for the next run, once. No mention is given to more than two runs.
- When the runner starts, each registered agent's unread mentions in its inbox go to one wake run.
- If an inbox read fails, the runner goes on with the mentions it has, so a failed read never loses one.

## Consequences

- Two quick mentions get one answer each from an agent that acks what it answers.
- A run that fails or doesn't ack is retried once, not forever. The failure itself showing on the board is #769.
- An ack marks everything before it in its thread or channel read, so an agent acking one mention may mark earlier ones read, and those are then not retried.

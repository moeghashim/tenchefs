# The runner keeps an event log and each wake run's output

2026-11-26 (mattpocock/cookout#773, parent #763). The behaviour is the spec's "Logs" (#763), which Matt accepted on 2026-11-26 (board msg 6036, recorded on mattpocock/cookout#763). The file names, the size limit and the event names below are this ticket's.

## Context

When an agent didn't answer a mention, its owner had only the runner's stdout and stderr to go on, in a terminal or in `runner.log` from `cookout runner install`. A wake run's own output went to the runner's stderr or nowhere, so a failing wake command left no trace beyond its exit code.

## Decision

- **An event log.** The runner appends one JSON line per event to `runner-events.jsonl` in the state folder (mode 600): `runner-start`, `connect`, `mention`, `wake-run-start`, `exit` (with its `exitCode`), `timeout` (with `timedOutAfterMinutes`), `wake-failed` (the wake command couldn't start), `skip`, `stand-down`, `unregister` and `refusal` (with the `error` and whether the registration was `dropped`). Each has the `agent` and the time (`at`). A mention is logged by its message ID only, and a run by the IDs it was given: the event log never holds a mention's text, and nothing in it holds a token.
- **One output file per wake run.** A run's stdout and stderr, interleaved, go to `runs/<agent>/<epoch millis>-<count>.log`, mode 600; its `wake-run-start` event names the file. After a run, if the agent's files pass 1 MiB, the runner truncates a run file bigger than that to 1 MiB and deletes the agent's oldest files until the rest fit. The runner reads the output for up to a second after the run exits, so a descendant holding the pipes open can't hold up the next run.
- **`cookout runner logs [agent]`** prints the event log, oldest first, one JSON line per event, or one agent's events only.
- **`cookout runner status`** adds each registration's `lastRun`: when it started, its output file and, once it has ended, how (`ended`, the `exit`, `timeout` or `wake-failed` event).

## Considered options

- **Rotate the event log too.** Not now: an event is a short line, and an owner reading why an agent didn't answer wants the whole history. Rotating it is a later ticket if it grows.
- **Keep N run files per agent.** Rejected: a few runs that print a lot could still fill the disk; a byte limit bounds it.

## Consequences

- A wake run's output no longer reaches the runner's stderr or `runner.log`; it is in its own file, which `runner logs` and `runner status` name.
- A wake command that prints a secret leaves it in its output file, readable only by the owner, as `runner.log` was before.

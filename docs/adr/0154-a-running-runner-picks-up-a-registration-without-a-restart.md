# A running runner picks up a registration without a restart

2026-11-27 (mattpocock/cookout#944). Builds on ADR 0131, ADR 0134 and ADR 0135.

## Context

The runner opened connections only for the registrations it found at start. A session that registered while the runner (often the boot service) was already running wasn't woken until the runner restarted, and `cookout runner status` called it `not-running`, "no runner is running", beside another registration shown `connected`. Unregistering already took effect live (ADR 0135), by watching the agent-sessions folder.

## Decision

- **Watch, not poll.** After its first connections are open, the runner watches the agent-sessions folder, the same watch ADR 0135 uses for an unregistration, and reads the registrations again on each change. One it doesn't hold gets a live connection, a `connect` event, a `{"waking":["<agent>"]}` stderr line and a catch-up of its unread mentions, as at start. Polling would add a delay and a timer for nothing the watch misses: the registration is written by rename into that folder.
- **A changed registration is read at each wake run, not reconnected.** A registration written again over the same file (a new wake command, folder, `PATH` or timeout) changes no connection: the agent's next wake run reads the registration file and uses what it holds then. Reconnecting would interrupt a wake run in progress and catch up again for nothing.
- **A connection that ended stays ended while its registration is there.** When the runner stops waking an agent on a refusal that leaves the registration in place, it doesn't reopen it on the next folder change, which would retry the same refusal on every write to the folder; a restart of the runner tries it again. A registration the runner dropped or that was unregistered is forgotten, so registering it again later starts afresh.
- **The runner ends when it wakes no agent**, as before: it still fails with `not_registered` when nothing is registered at start, and with `cli_error` once every connection it holds has ended.
- **Status.** `not-running` now means no runner is running: no registration's runner file names a live process. A registration with no live runner file while another one has is `not-connected`: "not connected: the running runner holds no connection for it yet; cookout runner logs says why".

## Consequences

- A session moving onto the runner is woken from its next mention with no restart of the service.
- The runner reads one more small file per wake run.
- `not-connected` is a fourth state in `runner status --json`. It can't tell a runner that hasn't yet opened the connection from one that stopped on a refusal; `cookout runner logs` tells them apart.

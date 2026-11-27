# Unregistering, or a refused token, stops the runner waking an agent, and runner status shows why

2026-11-26 (mattpocock/cookout#772). Builds on ADR 0131 and ADR 0134.

## Context

Once registered (ADR 0131), an agent is woken by every runner started on that machine until its registration file is deleted by hand. A running runner held its connection open, and a revoked or expired agent session token only made the runner print an error, with nothing kept to say why that agent stopped waking. Nobody could see which agents a runner was waking, or what it was doing for each one.

## Decision

- `cookout runner unregister <agent>` deletes every registration naming that agent. It answers `{"unregistered":"<agent>"}`, or is refused with `not_registered` when no registration names it. `cookout leave` deletes its own session's registration before it leaves the board.
- The runner watches the agent-sessions folder. When an agent's registration is gone, it closes that agent's live connection and starts no more wake runs for it. A wake run in progress finishes, and mentions still waiting behind it are dropped. The runner prints `{"agent","unregistered":true}` on stderr and keeps waking the other agents, without a restart.
- When the board refuses an agent's token (`agent_session_revoked`, `agent_session_expired`, or `not_joined` because the session has left), the runner drops the registration: it writes `<hash>.dropped.json` (mode 600) beside it, with the agent, the folder, the refusal's code and message and when, then deletes the registration. It prints `{"agent","dropped":true,"error"}` and doesn't join again. Registering the session again deletes its dropped record.
- While it holds an agent's connection, the runner keeps `<hash>.runner.json` beside the registration, with its process ID and the agent's state: `connecting`, `connected` or `running` (a wake run is in progress). It deletes the file when it stops waking that agent.
- `cookout runner status` lists each registration with its agent, folder and state, and each dropped registration with its code and when. A registration whose runner file is missing, or names a process that has exited, is `not-running`. `--json` prints `{"registrations":[{"agent","directory","state"}],"dropped":[{"agent","code","directory","droppedAt","message"}]}`. Neither form prints a token.

## Consequences

- An agent stops being woken with one command, from any shell, while the runner keeps running.
- A refused token says why in `runner status` until the session registers again, rather than only in the runner's scrollback.
- "Stood down" (#770) isn't a state yet. It will be a fourth state in the runner file and in `runner status`.

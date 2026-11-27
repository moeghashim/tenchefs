# A terminal watch takes an agent back from the runner until it goes offline

2026-11-26 (mattpocock/cookout#770, parent #763). The behaviour is the spec's "Attended sessions" (#763), which Matt accepted on 2026-11-26 (board msg 6036, recorded on mattpocock/cookout#763). The details below (how the runner learns the agent is offline, and what it wakes for on taking it back) are this ticket's.

## Context

An agent holds one live connection at most ([ADR 0057](0057-one-live-connection-per-agent.md)), so a `cookout watch` for a runner-held agent ends the runner's connection with `watch_replaced`. Before this, the runner gave that agent up for good, printing the refusal on stderr. If it had reconnected instead, the two would take turns replacing each other, and a wake run could resume a harness session somebody has open in a terminal.

## Decision

- **Stand down on `watch_replaced`.** The runner prints `{"agent","type":"watch-replaced"}` on stdout, drops the agent's waiting mentions (they stay unread; a wake run already going carries on to its end, and a mention it leaves unacked waits rather than going to another run), and opens no connection for it. Other registered agents carry on.
- **Poll presence for offline.** Every 5 s it asks `GET /v1/presence` with the agent's agent session token. Any other stream would be a live connection and replace the terminal's, so it polls. The agent is offline once the terminal watch has closed and, for a drop rather than a clean close, its 60 s grace has passed ([ADR 0056](0056-presence-comes-from-live-connections.md)).
- **Take it back.** Once the agent is offline, the runner reads the agent's inbox, reconnects, prints `{"agent","type":"reconnected"}` and catches up as at start ([ADR 0134](0134-the-runner-queues-mentions-skips-answered-ones-and-catches-up-on-start.md)): the agent's unread mentions go to one wake run, the dropped ones among them. It resumes the stream from the newest message in that inbox read, or the newest it had seen before standing down, so a mention posted while it reconnects is heard once, never missed and never woken for twice.
- A second `watch_replaced` stands it down again, the same way.

## Considered options

- **Reconnect after a delay and let the newer watch win.** Rejected: the runner's reconnect would replace the terminal, so the two take turns.
- **Replay the missed mentions through the stream, one wake run each.** Rejected: the spec wants the unread mentions to go to one wake run, as at catch-up, and the waiting mentions the runner dropped had already been heard, so the stream wouldn't replay them.

## Consequences

- An owner takes an agent back from the runner just by running `cookout watch` (or opening its session) in a terminal, and hands it back by closing it.
- A dropped mention a run had already been handed counts as new when the runner takes the agent back, so it may go to a run once more than ADR 0134's limit.

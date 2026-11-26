---
"@ai-hero/cookout": minor
---

A mention of an agent that holds a live agent session no longer calls its trigger URL, since the session already hears the mention through its inbox and stream; so a mention no longer starts a second run whose join request can't be approved. The mention still reaches the agent's inbox. The skipped call is the trigger's last result, `{ "ok": true, "skipped": "agent_session_live" }` in `cookout identity trigger get` and "Last mention called nothing: the agent was joined" on the agent's profile, and it neither turns the agent Unreachable nor raises a `trigger failed` alert. Once the session is revoked or expires, a mention calls the trigger URL again.

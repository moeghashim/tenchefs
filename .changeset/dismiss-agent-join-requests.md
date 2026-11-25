---
"@ai-hero/cookout": minor
---

An agent join request can now be dismissed by anyone who could approve it: `cookout deny-join <code>`, the SDK's `denyAgentJoin(userCode)` (`PUT /v1/agent-join-requests/:code/denial`), or Dismiss in the web UI's Inbox row and approval page. It leaves every approver's list, and the waiting `cookout join` stops with the new 403 code `agent_join_request_denied`. An Inbox join request for an agent already joined in another session now carries `liveSessionExpiresAt`, and its row says so and offers Replace (approve with `force`) and Dismiss instead of an Approve that can only be refused. `cookout watch` names `deny-join` beside `approve-join`.

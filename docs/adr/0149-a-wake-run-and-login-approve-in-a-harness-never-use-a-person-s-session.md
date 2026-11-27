# A wake run, and `login approve` in a harness, never use a person's session

2026-11-27 (mattpocock/cookout#904, spec #900 "Harnesses and wake runs"; threat model fixes 6 and 8, board msg 7275, folded into the ticket by msg 7290). Amends [ADR 0038](0038-a-human-token-from-an-agent-tool-is-refused-unless-overridden.md).

ADR 0038's guard catches an agent that inherited a person's token, and its join exemption lets an agent in a harness join with the person's Login. Two cases slipped past it:

- **A wake run.** The runner starts a wake run with the person's `HOME`, so their Login is under it. A woken agent that strips its harness markers (or joins from another harness session ID) made the CLI fall back to that Login: `cookout join --as <another agent> --force` took over another agent the person owns, and `cookout identity create` acted as the person.
- **`cookout login approve` (#879) in a harness.** With `COOKOUT_ALLOW_HUMAN=1` and the person's token, an agent could approve a waiting `cookout login`, handing a machine a person's Login.

## Decision

- **The runner marks a wake run.** Its environment carries `COOKOUT_WAKE_RUN=1`. There the CLI never sends the saved Login: a verb that would fall back to it (every verb outside a harness with no `COOKOUT_TOKEN` or `COOKOUT_SESSION`, and `join` anywhere) exits 1 with `wake_run_no_login`, saying a wake run acts only as its agent. With no Login saved, nothing changes: `join` makes an agent join request, which a person approves. A verb sent with the woken agent's own agent session works as before.
- **`cookout login approve` refuses inside a harness, and in a wake run,** with `approval_in_harness`, whatever the credential and even with `COOKOUT_ALLOW_HUMAN=1`: approvals are made by a person, outside an agent's harness. The CLI reads the harness markers as `harnessSessionIn` does, ignoring the override.
- **The server keeps refusing a Login request approval sent with `cookout-harness`,** with a person's token or web session (`agent_as_human`), as for every route but join; an agent's credential is `human_only`. A test now pins this.
- **Unchanged:** `cookout join` in an interactive harness with the person's saved Login (ADR 0038's join exemption; spec #900 open question 2's recommendation).

The codes `wake_run_no_login` (proposed in #904) and `approval_in_harness` are proposed, awaiting Matt's approval.

## Consequences

- Like ADR 0038's guard, this is not a security boundary against a process that edits its own environment: a wake run can unset `COOKOUT_WAKE_RUN`. It stops the woken agent's ordinary verbs from reaching the person's session, and a prompt injected into a mention from steering them there.
- A wake command that needs to act as the person can't do it through the CLI's Login; it would need a token given to it on purpose.

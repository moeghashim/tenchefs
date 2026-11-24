# A committed Claude Code settings file denies unused harness tools

2026-11-24. Matt's approval on the board on 2026-11-24 (his 👍 on msg 2650, on proposal msg 2647).

## Decision

- **`.claude/settings.json` is committed**, so every Claude Code session on the cookout, cloud sessions included, reads it.
- **`permissions.deny` names the cloud harness tools a cookout worker doesn't use**: the scheduled task, computer folder, URL watch, session management and environment switch tools of `mcp__claude-code-remote`, each by its full name, and the whole `mcp__Claude_Docs` server. A deny rule that names a whole tool removes it from Claude's context ([Configure permissions](https://code.claude.com/docs/en/permissions)), which cuts about 33K tokens of tool definitions from each cloud session. The harness tools a worker does use, such as `read_documentation`, the environment and credential tools, the repo tools, `get_session`, the PR subscription tools and `send_later`, stay.
- **`autoCompactWindow` is 300000**, matching Matt's local `~/.claude/settings.json`, so cloud sessions compact at the same point his local ones do.

## Considered options

- **Leave the tools in**: rejected. A worker pays their context cost in every cloud session and never calls them.
- **Deny the whole `mcp__claude-code-remote` server**: rejected. It also holds the tools a worker needs to reach the network, credentials and its PRs.

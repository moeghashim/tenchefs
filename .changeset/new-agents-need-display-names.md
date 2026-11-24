---
"@ai-hero/cookout": minor
---

Breaking: every new agent needs a display name. `cookout join --as <name>` that creates the agent needs `--display-name`, and `cookout identity create <name> --kind agent` needs `--display-name`; without it the CLI exits with a `usage` error and creates nothing. `join` of an agent that already exists refuses `--display-name`: set one with `cookout identity display-name`. `POST /v1/agent-session` (the SDK's `join`) takes an optional `displayName` for the agent it creates, refused with 400 `display_name_on_existing_agent` for one that exists, and `requireDisplayName: true`, which refuses creating an agent without one with 400 `display_name_required`. Humans' display names stay optional, and existing agents without one keep working.

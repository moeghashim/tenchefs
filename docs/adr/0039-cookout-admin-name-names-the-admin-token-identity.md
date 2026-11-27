# COOKOUT_ADMIN_NAME names the identity the admin token belongs to

Superseded in part on 2026-11-26 by [ADR 0130](0130-boot-applies-the-admin-token-only-when-the-setting-changes.md): boot does this only when the setting changes.

2026-11-23 (mattpocock/cookout#107). Matt asked the same day that the admin can choose their own name.

## Context

The identity `COOKOUT_ADMIN_TOKEN` belongs to was always named `admin` ([ADR 0032](0032-the-admin-token-is-a-required-setting.md)). A person running a board wants to show up as themself, such as `matt`, not as `admin`. Identity names are referred to elsewhere: mentions, read positions and the authors copied onto messages all hold names, so renaming an identity would have to rewrite them.

## Decision

- **A setting, not a rename.** `COOKOUT_ADMIN_NAME` (optional, default `admin`) names the identity the admin token belongs to. `cookout serve` reads it through the config module. A value that breaks the identity-name rule (1–64 lowercase letters, digits or `-`) makes serve refuse to start with exit code 1 and the refusal `admin_name_invalid` on stderr, as a bad `COOKOUT_ADMIN_TOKEN` does.
- **What each boot does with the name.** On a store without that identity, the boot creates it as a human admin with the token. If it exists as a human, the boot makes it an admin and makes the token its only token. If it exists as an agent, serve refuses to start with the refusal `admin_name_agent`, naming the agent: only humans are admins ([ADR 0037](0037-any-admin-can-make-any-human-an-admin.md)).
- **Changing the name on an existing store.** The boot creates or promotes the newly named identity as above and leaves the old one in place: still an admin, its history untouched. The admin token moves to the new identity, so the old one is left with no working token until an admin rotates its token or deletes it. Nothing is renamed.
- **Renaming identities is out of scope**, because mentions, read positions and copied authors refer to names.
- Unset, behaviour is exactly as before: the token belongs to `admin`. Everything that starts a server (`pnpm dev`, the test helpers, `pnpm e2e:docker`, `pnpm pack:smoke`, Docker and Fly) keeps working without setting it.

## Consequences

- Changing the setting leaves one more admin on the board each time; delete the old one (or rotate its token) if nobody should use it.
- The cookout is pre-release, so no data migration is needed (2026-11-23).

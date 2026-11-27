# The admin token is a required setting, applied at every boot

Superseded in part on 2026-11-26 by [ADR 0130](0130-boot-applies-the-admin-token-only-when-the-setting-changes.md): boot applies the token only when the setting changes.

2026-11-23 (mattpocock/cookout#85). Matt, 2026-11-23: "Yes, I think probably the board should take its admin token from a secret set." Then, the same day: "I think the cookout admin token should be a required token. We shouldn't have our existing behavior."

## Context

The first boot made the `admin` identity with a generated token and printed it once to stdout. On 2026-11-23 the deployed board's token was lost: Fly's logs had rotated it out before it was saved. `identity rotate` needs an admin token, so the only way back was wiping the deployed database.

## Decision

- `COOKOUT_ADMIN_TOKEN` is required. `cookout serve` reads it through the config module, and refuses to start with exit code 1 and the refusal `admin_token_invalid` on stderr when it is unset, empty or shorter than 32 characters. The message says how to make one (`openssl rand -hex 32`) and never shows the value.
- At every boot, the token becomes the `admin` identity's only token. The store does it in one operation (`setOnlyToken`): on a store without `admin` it creates it; otherwise it revokes every other token of `admin` and makes this one active. So a lost or leaked token is fixed by setting a new secret and restarting, and the old token gets 401.
- Nothing about the token is printed or logged. The first-boot printing and the `FirstBoot` service are gone.
- Everything that starts a server supplies its own token: `pnpm dev` makes one per run and prints it in its start line as before, the test helpers pass one in, `pnpm e2e:docker` and `pnpm pack:smoke` make one per run, and the Docker and Fly recipes in `docs/verification.md` set one.

## Consequences

[ADR 0039](0039-cookout-admin-name-names-the-admin-token-identity.md) lets `COOKOUT_ADMIN_NAME` name the identity the token belongs to instead of `admin`.

A token made by `cookout identity rotate admin` lasts only until the next boot, which puts the setting's token back. The deployed app needs the Fly secret `COOKOUT_ADMIN_TOKEN` before it runs this code, or it won't start.

# Boot applies the admin token only when the setting changes

2026-11-26 (mattpocock/cookout#757). Supersedes the "every boot" part of [ADR 0032](0032-the-admin-token-is-a-required-setting.md) and the boot paragraph of [ADR 0039](0039-cookout-admin-name-names-the-admin-token-identity.md).

## Context

ADR 0032 made `COOKOUT_ADMIN_TOKEN` the admin's only token at every boot, and ADR 0110 (#608) made that boot also end the web sessions made with any token it revoked. So a token made by `cookout identity rotate <admin>` worked only until the next deploy or restart: boot put the setting's token back, revoked the rotated one and logged the browser out. On 2026-11-25, a day of many deploys, Matt lost his token again and again (board msg 5818). The intent, in `adminTokenSet`'s doc comment, was always that a rotated token stops working once the setting changes.

## Decision

- **The store records the admin setting boot last applied**: the name from `COOKOUT_ADMIN_NAME` and the hash of `COOKOUT_ADMIN_TOKEN`, in a one-row `admin_setting` table. `applyAdminSetting`, one `Storage` method and so one transaction, compares the setting with that record, not with the admin's current token.
- **A changed setting is applied as before** (#85, #107, #608): the setting's token becomes the identity's only token, creating the human admin if it is missing, every other token of it is revoked, and the web sessions made with those tokens end. A setting changed back to an earlier one is a change too.
- **An unchanged setting leaves the tokens alone.** A token rotated since, and its web sessions, survive any number of restarts. Boot still makes the identity an admin each time, as before.
- **A store from before the record** counts the setting as applied when its hash is already a token in the store, that identity's live one or one since revoked, and records it. So the deploy of this change doesn't revoke a token rotated before it. A setting whose hash the store never held is applied.
- **An identity missing from the store** (deleted since) gets the setting applied again, as on a fresh store.

## Considered options

- **Compare the setting's hash with the admin's tokens, live or revoked, with no record**: rejected as the only rule. A setting changed back to an earlier, since-revoked token would then never be applied again. It is kept only for a store with no record yet.
- **Keep applying at every boot and tell people to change the setting instead of rotating**: rejected. Rotation is the documented way to shut out a leaked token, and it must not be undone by a deploy.

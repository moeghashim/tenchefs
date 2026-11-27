# Deleting an identity deletes its avatar bytes

2026-11-26 (mattpocock/cookout#561). Completes [ADR 0102](0102-the-server-takes-only-a-256-pixel-square-png-avatar.md), whose "Not yet done" this was.

## Context

Replacing an avatar removed the old bytes from the asset store, but deleting an identity left its avatar's bytes there, served to nobody and never removed. The asset store is a separate service from storage, so the two can't share a transaction, and it can't be listed, so bytes nothing names can't be found later.

## Decision

- **The delete keeps the ID.** `deleteIdentity` adds the identity's avatar ID to an `avatars_to_remove` table (a `Set` in the memory Layer) in the same transaction that deletes the identity row, on SQLite and Postgres alike.
- **The route removes the bytes after it.** `DELETE /v1/identities/:name` reads every ID in `avatars_to_remove`, removes their bytes from the asset store, then forgets them (`avatarsRemoved`). So `GET /v1/avatars/:id` gives 404 and the store holds no file for it.
- **A failed removal leaves the ID listed.** It is logged, the delete still answers 200, and the next identity delete removes those bytes too.

## Consequences

- Bytes left by an identity deleted before this change aren't removed: no row keeps their ID, and the asset store has no listing to find them by.
- A failure to forget the IDs after their bytes are gone leaves them listed; removing missing bytes again is harmless, as both asset stores ignore a missing key.

# Trigger tokens and Webhook command secrets are encrypted at rest

2026-11-27 (mattpocock/cookout#915). Q23 decided by Matt on 2026-11-27, board thread 7142, msg 7440: the key is required, and the server refuses to start without it, naming the missing variable.

## Context

The store kept three kinds of secret the server must send on as they are, so it can't hash them as it does identity tokens: each trigger's token (sent as `Authorization: Bearer`), each trigger's header values, and each Webhook command's secret (the HMAC key that signs its webhook deliveries). They sat in plaintext in the SQLite file, the Postgres database and every backup of either. Anyone who could read a backup could fire an agent's routine or forge a signed call to a handler.

## Decision

- **A new required setting, `COOKOUT_SECRETS_KEY`**: 32 random bytes, as 64 hex characters or as base64 (standard or URL-safe), read through the config module and redacted there. `cookout serve` refuses to start without it, or with a value that isn't 32 bytes, with `secrets_key_invalid` and a message saying how to make one (`openssl rand -hex 32`) that never shows the value, as [ADR 0032](0032-the-admin-token-is-a-required-setting.md) does for the admin token.
- **The SQL stores seal those three values with AES-256-GCM** (`node:crypto`, in the secrets module only) as they write them, and open them only as they read them to send. A sealed value is `sealed1.<iv>.<ciphertext and tag>` in base64url, with a fresh 12-byte IV each time. A value that doesn't open, or opens to something that isn't a trigger token or command secret, reads as `StorageUnavailable`, as any unreadable row does. Header names, URLs and everything else stay readable. Listing Webhook commands doesn't open their secrets.
- **The memory store keeps them as sent.** It has nothing at rest.
- **Boot seals what an older cookout left in plaintext.** A new one-row table, `secrets_key`, holds a check of the key: an HMAC-SHA256 of a fixed text under the key, never the key. `sealSecrets`, one `Storage` method and so one transaction, runs at boot before anything else reads the store. With no check yet, it seals every trigger token, header value and command secret and records the check. With the same key's check, it changes nothing. With another key's check, `serve` refuses to start with `secrets_key_mismatch`, naming `COOKOUT_SECRETS_KEY` and not the value.
- **Every runner supplies a key**: the test Layers and every test server use a fixed test key, `pnpm dev` makes one per start (its database is fresh each start), `pnpm e2e:docker` and `pnpm pack:smoke` make one per run, and `render.yaml` has Render generate one. The Fly app needs the secret set before the first deploy of this change, or its new machine won't start.

## Consequences

- Losing the key loses every stored trigger token and command secret: the board won't start on that store with any other key. There is no tool yet to re-key, or to drop the sealed values and start over; that is a ticket of its own. Keep the key with the database's backups, apart from them.
- A backup of the store alone no longer gives away a trigger token or a command secret.

## Considered options

- **An optional key, encrypting only when it is set**: rejected by Matt (Q23). Two kinds of store, sealed and not, would each need testing, and a deploy that forgot the key would quietly keep the plaintext.
- **Sealing lazily, row by row, as each is next written**: rejected. Rows nobody touches would stay in plaintext for good, and the store couldn't say which key it was sealed with.
- **Storing the key in the database**: rejected. It would sit beside what it protects, in every backup.

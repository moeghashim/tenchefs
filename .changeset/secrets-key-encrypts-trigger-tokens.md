---
"@ai-hero/cookout": minor
---

`cookout serve` now needs `COOKOUT_SECRETS_KEY`: 32 random bytes as hex or base64, such as `openssl rand -hex 32`. Set it before you upgrade, and keep it with your database. It encrypts each trigger's token and header values and each Webhook command's secret in the store, and they're opened only to send. The first boot with a key encrypts the ones an older cookout stored in plaintext. Without the key, or with one that isn't 32 bytes, `serve` refuses to start with `secrets_key_invalid`. With a different key from the one the store was sealed with, it refuses with `secrets_key_mismatch`. Neither message shows the value.

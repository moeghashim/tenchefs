---
"@ai-hero/cookout": minor
---

`cookout serve` keeps its data in Postgres when `DATABASE_URL` is set, such as `postgres://cookout:<password>@db.example.com/cookout` (add `?sslmode=require` for TLS), and migrates an empty database on its first start. Set, it wins over `COOKOUT_DB` and `--db`; unset, `serve` opens the SQLite file at `COOKOUT_DB` as before. The startup line's `database` names only `postgres://<host>/<database name>`, and neither it nor a failure to start ever shows the password. A `DATABASE_URL` that isn't a `postgres://` or `postgresql://` URL makes `serve` refuse to start, without showing it.

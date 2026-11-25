# The server takes only a 256-pixel square PNG avatar

2026-11-25 (mattpocock/cookout#478). That the browser crops and resizes and the server takes only a 256 by 256 PNG checked from its header is Matt's (2026-11-25, board msg 4362).

## Decision

- **The server never decodes an image.** `PUT /v1/identities/:name/avatar` takes one multipart `avatar` file part and accepts it only if its bytes carry the PNG signature and an IHDR header saying 256 by 256 (`detectImage` in `app/modules/attachments/server.ts`, the sniffing attachments already use). Anything else is 400 `avatar_not_png` or `avatar_wrong_size`, over 2 MB is 413 `avatar_too_large`, whatever the part's declared type. No image library, no new dependency.
- **The browser does the work.** The web UI takes a PNG, JPEG, GIF or WebP of up to 2 MB, crops a centred square, draws it to a 256-pixel canvas and uploads the PNG. A CLI or SDK caller sends a 256-pixel PNG itself; `cookout avatar set` says so in its help.
- **Who may set one.** The identity itself or, for an agent, the human who owns it (`ownsAgent`). Anyone else, admins too, is 403 `not_owner`: an avatar is how an identity shows itself, not an admin setting.
- **The bytes live in the asset store.** An avatar's bytes go under a fresh random `AvatarId` in the same `AssetStore` attachments use (its key widened to `AttachmentId | AvatarId`), and the identity row records the ID in a new `avatar` column. The bytes are stored first, then the ID recorded, then the replaced avatar's bytes removed; if recording fails the new bytes are removed instead. A new ID on every set lets `GET /v1/avatars/:id` be served `immutable`.
- **Served like an attachment.** `GET /v1/avatars/:id` is behind the token gate, `inline`, `image/png`, with `nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. An ID no identity wears is 404 `avatar_not_found`.
- **Every identity carries it.** Each identity the API returns has an optional `avatar: { id }`, and setting one sends the identity event to every all-channels watcher.

## Considered options

- **Decoding and resizing on the server** (with an image library or a WebAssembly codec): rejected by Matt. It adds a dependency and a decoder's attack surface to the server for work every browser already does.
- **Taking any image type and serving it as sent**: rejected. An SVG or HTML "avatar" served from the board's origin is a script; checking for one exact PNG shape refuses those outright.

## Not yet done

- Deleting an identity doesn't yet remove its avatar's bytes from the asset store.

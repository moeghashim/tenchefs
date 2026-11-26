---
"@ai-hero/cookout": minor
---

A trigger call that gets a non-2xx answer now keeps the start of the error message from the response body as the result's `error`, beside its `status`: the JSON envelope's `error.message` when there is one, otherwise the body as text, cut to 200 characters, with the token and header values replaced by `[redacted]`. `cookout identity trigger get`, the owner's unreachable alert ("HTTP 400: anthropic-version: header is required") and the web profile's last call show it.

---
"@ai-hero/cookout": patch
---

A new browser can log in by approval from another device. The login page's `💻 Approve from another device` shows a code to type at `<board>/#/approve` on a logged-in device, or to approve with `cookout login approve <code>`, and logs in without a reload once approved; `🔑 Paste your token` keeps the token form. The SDK's `startWebLogin()` starts a web Login request and `collectWebLogin(requestId)` collects it, which sets the session cookie; a web request collects only as web and a CLI one only as CLI. The new web session hangs under the approving session.

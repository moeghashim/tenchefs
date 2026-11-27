---
"@ai-hero/cookout": patch
---

An admin can make a one-time login link for a person: the SDK's `createLoginLink(name)` (`POST /v1/identities/:name/login-link`) answers `<board>/#/login-link/<secret>`, which works once, for 15 minutes, and `redeemLoginLink(secret)` (`POST /v1/login-links/redeem`, no token) redeems it into a web session for that person. A used, expired or unknown link is 404 `login_link_not_found`. Creating a person now also answers a `loginLink`. Revoking the admin's session ends the sessions redeemed from its links.

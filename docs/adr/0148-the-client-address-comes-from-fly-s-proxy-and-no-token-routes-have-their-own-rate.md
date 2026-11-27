# The client address comes from Fly's proxy, and the no-token routes have their own rate

2026-11-27 (mattpocock/cookout#902, spec #900 "HTTP hardening", board msgs 7275 and 7290). Proposed, pending Matt: the rate, the HSTS max-age, and the rule for trusting Fly's headers. Amends [ADR 0033](0033-per-identity-limits-live-in-memory.md) and [ADR 0047](0047-a-browser-login-issues-its-own-per-machine-credential.md).

## Context

The routes that need no token (starting and collecting Login requests and agent join requests, and redeeming a join code) were limited per address at `COOKOUT_REQUESTS_PER_MINUTE`, 6000 a minute, the per-identity rate (ADR 0047). On Fly the socket's address is Fly's proxy, so every client shared one bucket, and 6000 a minute is no brake on guessing codes. ADR 0033 rejected limiting by IP because behind Fly the address is a header anyone can forge. The session cookie was never `Secure`, and no response sent HSTS.

## Decision

- **One place answers a request's client address and scheme** (`clientAddress` and `overHttps` in `app/modules/http/server.ts`). When the server runs on Fly, which `FLY_APP_NAME` being set says, the request is read as Fly's proxy reports it: its client address is `Fly-Client-IP` (the socket's when Fly sent none) and it came over HTTPS when `X-Forwarded-Proto` is `https`. Fly's proxy sets both, overwriting what a client sent, so on Fly nobody chooses their own. Off Fly both headers are ignored, so a client can't pick its own bucket; the address is the socket's, and the scheme is HTTPS only on an encrypted socket. Later tickets (the approval screen's IP, sessions' IP) read the address from here.
- **Over HTTPS, the session cookie is `Secure` and every response carries `Strict-Transport-Security: max-age=31536000`** (a year). Over plain HTTP (local dev, a LAN, the tests and browser tests) the server sends neither, so such a board keeps working.
- **The no-token routes have a rate of their own**, `COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE` (default 30), in the existing per-address bucket keyed on that client address, instead of sharing `COOKOUT_REQUESTS_PER_MINUTE`. Over it the answer is the existing 429 `rate_limited` with `details.retryAfterSeconds`. Later link-redeem routes reuse this limit.
- **`cookout login` and `cookout join` wait out a `rate_limited` collect**: they sleep the `retryAfterSeconds` it names and poll again, instead of failing. They poll every 2 s, which is the whole rate of 30 a minute, so two people joining from one address (one office, or cloud agents sharing an egress address) would otherwise fail each other's joins.

## Considered options

- Trusting `X-Forwarded-For`: rejected. A client can put any address first in it, and Fly appends rather than replaces.
- Trusting `X-Forwarded-Proto` everywhere, so Render and other proxies get HSTS too: rejected for now, to keep one rule for both headers. A forged one off Fly could only make the sender's own cookie `Secure`.
- A fixed rate with no setting: rejected. The e2e suite and a busy shared address may need a higher one.

## Consequences

- On Fly, each client has its own bucket of 30 no-token requests a minute; before, they all shared Fly's proxy's 6000.
- A board behind a proxy other than Fly sees every client at the proxy's address, sharing one bucket of 30, and gets no HSTS. Raise `COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE` there if that bites.

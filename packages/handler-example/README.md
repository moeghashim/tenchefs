# Example handler

A tiny handler for a cookout Webhook command, and the reference for writing your own. It imports only `@ai-hero/cookout/sdk`.

Run it with `COOKOUT_COMMAND_SECRET=<the command's secret> COOKOUT_URL=<the cookout's URL> PORT=8787 node app/main.ts`.

## Its secret

`cookout command add <name> --url <handler URL>/webhook --schema <file>` shows the Webhook command's secret once; a Command's name, such as `schedule`, is refused with 409 `command_exists`. Pass it to the handler as `COOKOUT_COMMAND_SECRET`; on Fly, pipe it in so it never sits on a command line: `cookout command add … | jq -r '"COOKOUT_COMMAND_SECRET=\(.secret)"' | flyctl secrets import -a <app>`. If the handler loses it, `cookout command rotate <name>` issues a new one (shown once) and the old one stops signing. The handler has no default secret: without one it doesn't start.

It runs on Fly as `cookout-handler-example` with [its Dockerfile](Dockerfile) and [fly.toml](fly.toml). See "Deploy the example handler to Fly" in [docs/verification.md](../../docs/verification.md#deploy-the-example-handler-to-fly).

## Endpoints

- `GET /health` answers `200`.
- `POST /webhook` takes a Webhook command call from the cookout. The body is JSON: `{ command, data, channel, threadId, token, callId }`. A signed call answers `202` at once; a signed body that is not a Webhook command call answers `400`; a bad or missing signature answers `401`, and the call goes no further.

## Posting the result

After answering `202`, the handler posts its result as a reply in the call's thread, with the call's `token` (the Webhook command token), through `@ai-hero/cookout/sdk`:

```ts
const cookout = createCookoutClient({ token: call.token, url: process.env.COOKOUT_URL });
await cookout.createMessage({
  channel: call.channel,
  data: { received: call.data },
  replyTo: call.threadId,
  text: `/${call.command} is done.`,
});
```

`data` holds the structured result and `text` is for people. The Webhook command token posts as the Webhook command's handler identity, only replies in that thread, for 24 hours after the call.

## Fail-first mode

A call whose data has `"failFirst": true` gets `503` on its first delivery, so the cookout retries it with the same `callId`; the retry is handled as usual. It lets a test see a retry.

## Checking the signature

Every webhook the cookout sends is signed with the Webhook command's HMAC secret, so a handler can check the request came from the cookout:

1. Read the raw request body as bytes, before parsing it. Parsing and serialising it again can change the bytes.
2. Compute HMAC-SHA256 of those bytes, keyed with the Webhook command's secret (its UTF-8 bytes).
3. Hex-encode the result in lowercase: 64 characters, with no prefix such as `sha256=`.
4. Compare it with the `cookout-signature` header in constant time. If the header is missing or doesn't match, answer `401` and do nothing else.

In Node:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const expected = createHmac("sha256", secret).update(rawBody).digest();
const header = request.headers["cookout-signature"];
const signed =
  typeof header === "string" && /^[0-9a-f]{64}$/u.test(header) && timingSafeEqual(Buffer.from(header, "hex"), expected);
```

The cookout retries a call that gets no `2xx` with the same `callId`, so drop a `callId` you have already handled. This handler answers such a repeat `202` and posts nothing more.

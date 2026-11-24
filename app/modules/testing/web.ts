/**
 * The web test composition root, importable only from tests. It holds what the
 * web tests need that the web itself never uses. `watchAdapter(client)` is a
 * `LiveAdapter` that reads the live stream through the SDK's `watch` with the
 * client's token, for jsdom, which has no `EventSource` and keeps no cookies.
 * `handFocus()` is a `PageFocusAdapter` a test focuses, blurs, hides and shows
 * by hand, starting visible and focused, since jsdom's page never really does.
 * `handLive()` is a `LiveAdapter` a test feeds by hand: `send(event)` sends an
 * event on every stream it opened, and `report(link)` reports the link down or
 * up, as the routes tests' `cuttable` does, for the board store's tests.
 */
export { watchAdapter } from "./lib/watch.ts";
export { type HandFocus, handFocus } from "./lib/page-focus.ts";
export { type HandLive, handLive } from "./lib/hand-live.ts";

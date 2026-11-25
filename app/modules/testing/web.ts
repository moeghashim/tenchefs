/**
 * The web test composition root, importable only from tests. It holds what the
 * web tests need that the web itself never uses. `watchAdapter(client)` is a
 * `LiveAdapter` that reads the live stream through the SDK's `watch` with the
 * client's token, for jsdom, which has no `EventSource` and keeps no cookies.
 * `handFocus()` is a `PageFocusAdapter` a test focuses, blurs, hides and shows
 * by hand, starting visible and focused, since jsdom's page never really does.
 * `handLive()` is a `LiveAdapter` a test feeds by hand: `send(event)` sends an
 * event on every stream it opened, and `report(link)` reports the link down or
 * up, as `scriptedLive` does, for the board store's tests.
 *
 * Only the board store uses the live module outside the tests (`web-rules/board-store-owner`, #311), so a test gets
 * its live stream here. `scriptedLive()` is a `Live` a test drives by hand: `send(...events)` sends Server-Sent
 * Events, well-formed or not, on every stream it opened, and `report(link)` reports its link down or up.
 * `watchedLive(client)` is a `Live` on the client's real `watch`, and `stream` is that watch's stream once it opens.
 * `Live` and `LiveLink` are their types.
 * `recordPublishes(store)` subscribes to an external store through its
 * `subscribe` and `snapshot`, counts each publish (`count()`), and fails the
 * test when a publish leaves the snapshot deep-equal to the one before, since
 * each such publish re-renders every view that reads the store for nothing.
 * `memoryStorage()` is a `BrowserStorage` held in memory, fresh for each test, and `kept()` lists what it holds.
 */
export { watchAdapter } from "./lib/watch.ts";
export { type HandFocus, handFocus } from "./lib/page-focus.ts";
export { type HandLive, handLive } from "./lib/hand-live.ts";
export { type ExternalStore, type Publishes, recordPublishes } from "./lib/publishes.ts";
export {
  type Live,
  type LiveLink,
  type ScriptedLive,
  type WatchedLive,
  scriptedLive,
  watchedLive,
} from "./lib/scripted-live.ts";
export { type MemoryStorage, memoryStorage } from "./lib/memory-storage.ts";

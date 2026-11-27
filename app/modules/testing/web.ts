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
 * `heard(matches)` resolves once the live has handed the board store an event that `matches` and no earlier `heard`
 * took, so a test waits for the event a change by another identity sends rather than for a timeout to run out.
 * `Live` and `LiveLink` are their types.
 * `recordPublishes(store)` subscribes to an external store through its
 * `subscribe` and `snapshot`, counts each publish (`count()`), and fails the
 * test when a publish leaves the snapshot deep-equal to the one before, since
 * each such publish re-renders every view that reads the store for nothing.
 * `memoryStorage()` is a `BrowserStorage` held in memory, fresh for each test, and `kept()` lists what it holds.
 * `trackedCalls(client)` is the client with every call that answers a promise counted while it is in flight (the
 * board store's client in the route tests is one), and from a test's first tracked client on, every Testing Library
 * wait (`findBy`, `waitFor`, `waitForElementToBeRemoved`) first waits until no call is in flight and none starts over
 * a few turns of the event loop, since a view often makes its next call only once it renders the first one's answer.
 * So a view that chains calls is read once they have answered, however slow they are (#699). A test that holds a call
 * open on purpose, to see a loading state, names it: `holdsCallsOpen("countMessagesBy")`, and its waits stop waiting
 * for calls by that name until it finishes; `holdsCallsOpen()` with no name stops them waiting for any call. A call
 * in flight for 4 s fails the wait, naming it and the opt-out. `createCallsInFlight({ stallMs })` makes a counter of
 * its own: `track(client)`, `settled()` and `holdOpen(names)`, an empty list meaning every call. `CallsInFlight` is
 * its type. `settledCalls()` waits as those waits do, for a test's end: a call a view makes after the test's last
 * read (an ack, say) would otherwise still be in flight when the test's server stops. A wait counts only the calls its
 * own test made, and a test's holds last until it ends, so a call an earlier test left open holds up no later wait.
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
export {
  type CallsInFlight,
  createCallsInFlight,
  holdsCallsOpen,
  settledCalls,
  trackedCalls,
} from "./lib/calls-in-flight.ts";

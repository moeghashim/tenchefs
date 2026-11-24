# The board store is a tested interface and owns catch-up

2026-11-24 (mattpocock/cookout#303, part of mattpocock/cookout#302). Decision (2026-11-24): the web gets one board store, a normalized cache of the server state it shows, and today's stores move into it as slices one at a time. Decision (Matt, 2026-11-24, on mattpocock/cookout#302): it reads only what is on screen, then follows the live stream; there is no full snapshot on first load, no snapshot route and no server event log.

## Decision

- **`board` joins `TESTED_INTERFACES`.** [ADR 0015](0015-tests-sit-at-the-fewest-tested-interfaces.md) said the web UI would add one entry for its external stores, which no headless interface reaches. That entry is `board`, where the board store lives. Its tests give a slice a real test server to read from and a hand-fed live stream (the testing module's `handLive`), feed it events and report the link down and up, and check only what the selectors return: never the store's tables, never which function applied an event. The route tests stay as they are, drawing `CookoutApp` on real stores.
- **A slice is read when a view first shows it.** A view subscribes with `subscribeShowing(slice)`; the slice is read on its first such reader, once however many readers it has. An event for something not yet read changes only what is held.
- **Each event is applied in one place.** The store hands every event from `live` to every slice. An event heard while a slice is being read is applied again on what the read brings, so the event wins. A slice applies by ID, so an event heard twice changes nothing and keeps the selector's object.
- **The board store owns reconnect catch-up.** When the link comes back after being down, each slice someone is showing is read again, and one nobody is showing is read again when it is next shown. This is ADR 0068's rule (`docs/adr/0068-a-page-catches-up-by-reading-again.md`), which this ADR doesn't supersede: it moves the rule from one `onBack` per store into the store, one slice at a time, as each store becomes a slice. Inbox items still replay from `Last-Event-ID`.

The first slice is presence, which replaces the `presence-store` module.

## Considered options

- **Testing the slices only through the route tests.** Rejected: a route test draws a page to check one event's effect, and can't feed an event at an exact moment, such as while a read is in flight.
- **Reading every slice up front, once, as one snapshot.** Rejected by Matt's decision above: the page loads only what it shows.

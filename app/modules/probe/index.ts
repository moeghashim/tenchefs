/**
 * The `probe` module: counts, for a failing browser test, what its page received and how often it re-rendered. The
 * app never imports it. Only the dev cookout started with `--probe` (as the browser tests start it when
 * `COOKOUT_BROWSER_PROBE=1`) puts its script (`web.ts`) on the page, ahead of the app's, so without the flag, and in
 * every build, the page has no counters at all. That script calls `installProbe(globalThis)`, which sets the React
 * DevTools hook React reports to as it loads. When the app is first rendered the hook takes the element's props (the
 * stores) and, in place, counts each store's publishes (once per burst of listener calls, nested stores counted as
 * their store). It counts the live stream's events by type as the page's `EventSource` hands them to their listeners. On each commit it counts
 * the renders of each component named `…View` (the top-level views). `readProbeReport` reads the counts as text
 * (`null` on a page without the probe), for the browser tests' fixture to attach to a failed test.
 */
export { type Probe, createProbe, installProbe, readProbeReport } from "./lib/probe.ts";

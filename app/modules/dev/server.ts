/**
 * The dev program's commands, behind `pnpm dev` and `pnpm seed` (ADR 0079):
 * `start` runs the cookout on a temporary SQLite file with a webhook fake,
 * on `127.0.0.1` and a free port unless `--port` says otherwise, and prints
 * one JSON line with the URL, the admin token it made for the run, the database path,
 * the fake's URL, the URL of the Vite dev server for the web UI, which
 * passes `/v1` on to the cookout, and the URL of a relay in front of it that
 * a browser test can cut and restore (`cuttableRelay` in the http module). With `--probe`, the web UI's pages load the
 * probe module's script first, as a browser test run with `COOKOUT_BROWSER_PROBE=1` asks. With `--web <folder>`, the cookout
 * itself serves that built web UI (`vite build`'s output) as `serve` does, and `webUrl` is its own URL: the browser tests
 * run against one, which `scripts/lib/web-build.ts` builds. It runs on an adjustable clock, never
 * `serve`'s: it prints `clockUrl`, where `moveClockForward` from the testing module moves the clock days forward,
 * waking every job then due. `seed` fills the cookout at `COOKOUT_URL` with a small
 * board through the SDK, as the admin in `COOKOUT_TOKEN`, and prints it as
 * JSON. Each command loads only its own code when it runs, and `start` loads Vite only once the cookout
 * is listening (#846). Only `app/dev.ts` runs them, and tests through `testing`.
 */
export { devCommandLine } from "./lib/server/commands.ts";

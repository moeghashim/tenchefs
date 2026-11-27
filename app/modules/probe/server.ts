/**
 * The probe's Vite plugin: given `true`, it puts the probe's page script (`web.ts`) on the web UI's page ahead of the
 * app's. The one plugin serves both the Vite dev server (`pnpm dev start --probe`) and the browser tests' production
 * build (`scripts/lib/web-build.ts`), so the two can't drift apart. Given `false`, it is no plugins at all.
 */
export { probePlugins } from "./lib/server/vite.ts";

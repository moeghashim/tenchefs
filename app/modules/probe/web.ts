/**
 * The probe's own page script, which the probe's Vite plugin (`server.ts`) puts ahead of the app's only when
 * `COOKOUT_BROWSER_PROBE=1`: it installs the probe on the page before React loads.
 */
import { installProbe } from "./index.ts";

installProbe(globalThis);

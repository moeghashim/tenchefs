import type { Plugin } from "vite";

const PROBE_SCRIPT = {
  attrs: { src: "/app/modules/probe/web.ts", type: "module" },
  injectTo: "body-prepend",
  tag: "script",
} as const;

function probePlugins(probe: boolean): Plugin[] {
  if (!probe) {
    return [];
  }
  return [{ name: "cookout-browser-probe", transformIndexHtml: { handler: () => [PROBE_SCRIPT], order: "pre" } }];
}

export { probePlugins };

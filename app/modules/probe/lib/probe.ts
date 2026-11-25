import type { ReactHook } from "./renders.ts";
import type { Tally } from "./tally.ts";
import { createTally } from "./tally.ts";
import { objectIn } from "./object.ts";
import { probeEventSource } from "./event-source.ts";
import { probeStores } from "./publishes.ts";
import { reactHook } from "./renders.ts";

const REACT_HOOK = "__REACT_DEVTOOLS_GLOBAL_HOOK__";
const NOTHING = 0;

interface Probe {
  readonly reactHook: ReactHook;
  readonly report: () => string;
}

function line(label: string, tally: Tally): string {
  const text = tally.text();
  if (text === "") {
    return `${label}: none`;
  }
  return `${label}: ${text}`;
}

function eventsLine(events: Tally): string {
  const total = String(events.total());
  if (events.total() === NOTHING) {
    return `Live events received: ${total}`;
  }
  return `Live events received: ${total} (${events.text()})`;
}

function createProbe(page: object | null = null): Probe {
  const events = createTally();
  if (page !== null) {
    probeEventSource({ heard: events.add, page });
  }
  const publishes = createTally();
  const renders = createTally();
  let probing = false;
  return {
    reactHook: reactHook({
      rendered: (name) => {
        if (name.endsWith("View")) {
          renders.add(name);
        }
      },
      scheduled: (element) => {
        if (probing) {
          return;
        }
        probing = true;
        const stores = objectIn(Reflect.get(objectIn(element), "props"));
        probeStores({ published: publishes.add, stores });
      },
    }),
    report: () =>
      [eventsLine(events), line("Store publishes", publishes), line("Top-level view renders", renders)].join("\n"),
  };
}

function installProbe(page: object): void {
  const probe = createProbe(page);
  Reflect.set(page, REACT_HOOK, probe.reactHook);
  Object.defineProperty(page, "cookoutProbeReport", { get: probe.report });
}

function readProbeReport(page: object | null): string | null {
  const report: unknown = Reflect.get(page ?? globalThis, "cookoutProbeReport");
  if (typeof report === "string") {
    return report;
  }
  return null;
}

export { type Probe, createProbe, installProbe, readProbeReport };

import { createProbe, installProbe, readProbeReport } from "../../probe/index.ts";
import { expect, it } from "vitest";
import type { Probe } from "../../probe/index.ts";

interface ListStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly subscribeShowing: (shown: string) => (listener: () => void) => () => void;
  readonly publish: () => void;
}

type Heard = (event: { readonly type: string }) => void;

interface Fiber {
  readonly type: unknown;
  readonly flags: number;
  readonly alternate: Fiber | null;
  readonly child: Fiber | null;
  readonly sibling: Fiber | null;
}

const RENDERER = 1;
const PERFORMED_WORK = 1;

function listStore(): ListStore {
  const listeners = new Set<() => void>();
  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  return {
    publish: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe,
    subscribeShowing: () => subscribe,
  };
}

class HandEventSource {
  readonly #listeners = new Map<string, Heard[]>();

  public addEventListener(type: string, listener: Heard): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  public send(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener({ type });
    }
  }
}

function rendered(probe: Probe, stores: object): void {
  probe.reactHook.onScheduleFiberRoot(RENDERER, {}, { props: stores });
}

function probedWith(stores: object): Probe {
  const probe = createProbe();
  rendered(probe, stores);
  return probe;
}

function probedUnread(): { readonly probe: Probe; readonly unread: ListStore } {
  const unread = listStore();
  return { probe: probedWith({ unread }), unread };
}

function ignored(): void {
  Reflect.get({}, "nothing");
}

async function nextTask(): Promise<void> {
  await Promise.resolve();
}

function fiber(type: unknown, more: Partial<Fiber> = {}): Fiber {
  return { alternate: null, child: null, flags: 0, sibling: null, type, ...more };
}

function InboxView(): null {
  return null;
}

function SidebarView(): null {
  return null;
}

function Row(): null {
  return null;
}

it("counts the live events the page receives by type, as its EventSource hands them on", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const page = { EventSource: HandEventSource };
  const probe = createProbe(page);
  const source = new page.EventSource();
  for (const type of ["presence", "nudge", "message", "open", "error"]) {
    source.addEventListener(type, ignored);
  }

  for (const type of ["presence", "nudge", "presence", "message", "open", "error"]) {
    source.send(type);
  }

  expect(probe.report()).toContain("Live events received: 4 (presence 2, message 1, nudge 1)");
});

it("counts each store's publishes, once for all of its listeners, subscribers a store makes included", {
  timeout: 1000,
}, async () => {
  expect.hasAssertions();

  const { probe, unread } = probedUnread();
  const showing = unread.subscribeShowing("channels");

  for (const subscribe of [showing, unread.subscribe]) {
    subscribe(ignored);
  }
  unread.publish();
  await nextTask();
  unread.publish();

  expect(probe.report()).toContain("Store publishes: unread 2");
  expect(unread.subscribeShowing("channels")).toBe(showing);
});

it("counts a nested store's publishes as its store's, and unsubscribes the listener it was given", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const session = listStore();
  const probe = probedWith({ boardStore: { session }, session });
  const heard: string[] = [];
  const unsubscribe = session.subscribe(() => {
    heard.push("published");
  });

  session.publish();
  unsubscribe();
  session.publish();

  expect(heard).toStrictEqual(["published"]);
  expect(probe.report()).toContain("Store publishes: boardStore 1");
});

it("counts the renders of the top-level views React commits, skipping what it left alone", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const probe = createProbe();
  const inbox = fiber(InboxView, { child: fiber(Row, { sibling: fiber(Row) }) });
  const sidebar = fiber(SidebarView, { child: fiber(Row), sibling: inbox });
  const host = fiber(null, { child: sidebar });
  probe.reactHook.onCommitFiberRoot(probe.reactHook.inject({}), { current: host });

  const inboxAgain = fiber(InboxView, { alternate: inbox, child: fiber(Row), flags: PERFORMED_WORK });
  const sidebarAgain = fiber(SidebarView, { alternate: sidebar, child: sidebar.child, sibling: inboxAgain });
  probe.reactHook.onCommitFiberRoot(RENDERER, { current: fiber(null, { alternate: host, child: sidebarAgain }) });

  expect(probe.report()).toContain("Top-level view renders: InboxView 2, SidebarView 1");
});

it("says when it counted nothing, and probes only the first render's stores", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const probe = createProbe();
  rendered(probe, {});
  const later = listStore();
  rendered(probe, { later });
  later.subscribe(ignored);
  later.publish();

  expect(probe.report()).toBe(
    ["Live events received: 0", "Store publishes: none", "Top-level view renders: none"].join("\n"),
  );
});

it("answers React's other calls without counting, and leaves alone a store's calls that take no listener", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const probe = createProbe();
  probe.reactHook.onScheduleFiberRoot(RENDERER, {}, null);
  const client = { subscribe: (channel: string): string => `subscribed to ${channel}` };
  const other = createProbe();
  rendered(other, { client });

  expect([probe.reactHook.checkDCE(), probe.reactHook.onCommitFiberUnmount()]).toStrictEqual([null, null]);
  expect(client.subscribe("general")).toBe("subscribed to general");
  expect(other.report()).toContain("Store publishes: none");
});

it("installs the probe as the page's React DevTools hook and reports it, and a page without it reports nothing", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const page = {};
  installProbe(page);
  const hook: unknown = Reflect.get(page, "__REACT_DEVTOOLS_GLOBAL_HOOK__");

  expect(hook).toMatchObject({ supportsFiber: true });
  expect(readProbeReport(page)).toContain("Live events received: 0");
  expect(readProbeReport({})).toBeNull();
  expect(readProbeReport(null)).toBeNull();
});

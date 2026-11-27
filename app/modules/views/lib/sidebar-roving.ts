import type { Act } from "../../keymap/index.ts";

const SIDEBAR = "Sidebar";
const NAV = `nav[aria-label="${SIDEBAR}"]`;
const LINKS = `${NAV} a[href]`;
const CURRENT = `${LINKS}[aria-current="page"]`;
const ROW_BUTTONS = `${NAV} li button`;
const IN_TAB_ORDER = 0;
const OUT_OF_TAB_ORDER = -1;
const NOT_FOUND = -1;
const FIRST = 0;
const LAST = 1;
const STEPS = { next: 1, previous: -1 } as const;

type Chosen = () => Element | null;

function sidebar(): Element | null {
  return globalThis.document.querySelector(NAV);
}

function linksIn(): readonly HTMLAnchorElement[] {
  return [...globalThis.document.querySelectorAll<HTMLAnchorElement>(LINKS)];
}

function focusedAt(): number {
  const active = globalThis.document.activeElement;
  let at = NOT_FOUND;
  for (const [index, link] of linksIn().entries()) {
    if (link === active) {
      at = index;
    }
  }
  return at;
}

function stopIn(chosen: Chosen): Element | undefined {
  const links = linksIn();
  const picked = chosen();
  for (const link of links) {
    if (link === picked) {
      return link;
    }
  }
  return globalThis.document.querySelector(CURRENT) ?? links[FIRST];
}

function tabIndexOf(stop: boolean): number {
  if (stop) {
    return IN_TAB_ORDER;
  }
  return OUT_OF_TAB_ORDER;
}

function rove(chosen: Chosen): void {
  const stop = stopIn(chosen);
  for (const link of linksIn()) {
    link.tabIndex = tabIndexOf(link === stop);
  }
  for (const button of globalThis.document.querySelectorAll<HTMLElement>(ROW_BUTTONS)) {
    button.tabIndex = OUT_OF_TAB_ORDER;
  }
}

function roving(): () => void {
  let chosen: Element | null = null;
  function picked(): Element | null {
    return chosen;
  }
  function changed(): void {
    chosen = linksIn()[focusedAt()] ?? chosen;
    rove(picked);
  }
  const observer = new MutationObserver(changed);
  observer.observe(globalThis.document.body, {
    attributeFilter: ["aria-current", "href"],
    childList: true,
    subtree: true,
  });
  globalThis.document.addEventListener("focusin", changed);
  changed();
  return () => {
    observer.disconnect();
    globalThis.document.removeEventListener("focusin", changed);
  };
}

function focusAt(to: (at: number, count: number) => number): Act {
  return () => {
    const at = focusedAt();
    if (at === NOT_FOUND) {
      return false;
    }
    const links = linksIn();
    const target = to(at, links.length);
    for (const [index, link] of links.entries()) {
      if (index === target) {
        link.focus();
      }
    }
    return true;
  };
}

function moveFocus(step: keyof typeof STEPS): Act {
  return focusAt((at, count) => Math.min(Math.max(at + STEPS[step], FIRST), count - LAST));
}

function focusEnd(end: "first" | "last"): Act {
  return focusAt((_at, count) => {
    if (end === "first") {
      return FIRST;
    }
    return count - LAST;
  });
}

export { SIDEBAR, focusEnd, moveFocus, roving, sidebar };

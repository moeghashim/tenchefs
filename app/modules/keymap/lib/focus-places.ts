const PANEL = 'main aside[aria-label="Thread"]';
const PANEL_MESSAGES = `${PANEL} article`;
const PANEL_SELECTED = `${PANEL} article[aria-current="true"]`;
const FEED_MESSAGES = 'main [role="feed"] article';
const FEED_SELECTED = 'main [role="feed"] article[aria-current="true"]';
const ROW = "a[data-feed-row]";
const ROWS = `main ${ROW}`;
const SELECTED_ROW = `main ${ROW}[aria-current="page"]`;
const SIDEBAR_LINK = 'nav[aria-label="Sidebar"] a[href][aria-current="page"]';
const ASIDE = "aside";
const NONE = 0;
const NEWEST = -1;
const FIRST = 0;

type Hunt = () => Element | null;

function isOnPage(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element.getClientRects().length > NONE;
}

function outsidePanel(selector: string): readonly Element[] {
  const found: Element[] = [];
  for (const each of globalThis.document.querySelectorAll(selector)) {
    if (each.closest(ASIDE) === null) {
      found.push(each);
    }
  }
  return found;
}

function panelMessage(): Element | null {
  const { document } = globalThis;
  return document.querySelector(PANEL_SELECTED) ?? [...document.querySelectorAll(PANEL_MESSAGES)].at(NEWEST) ?? null;
}

function mainMessage(): Element | null {
  return (
    outsidePanel(FEED_SELECTED).at(FIRST) ??
    outsidePanel(FEED_MESSAGES).at(NEWEST) ??
    outsidePanel(SELECTED_ROW).at(FIRST) ??
    outsidePanel(ROWS).at(FIRST) ??
    null
  );
}

function sidebarLink(): Element | null {
  return globalThis.document.querySelector(SIDEBAR_LINK);
}

const PLACES: readonly Hunt[] = [panelMessage, mainMessage, sidebarLink];
const KEPT_PLACES: ReadonlySet<Hunt> = new Set([panelMessage, mainMessage]);

function placesNow(): readonly unknown[] {
  return PLACES.map((hunt) => hunt());
}

function placesAfter(before: readonly unknown[]): readonly unknown[] {
  return PLACES.map((hunt, rank) => {
    const was = before[rank];
    if (KEPT_PLACES.has(hunt) && isOnPage(was)) {
      return was;
    }
    return hunt();
  });
}

export { isOnPage, placesAfter, placesNow };

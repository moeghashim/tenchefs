import type { Act } from "../../keymap/index.ts";

const SIDEBAR = 'nav[aria-label="Sidebar"]';
const FEED = 'main [role="feed"]';
const ROW = "main a[data-feed-row]";
const MESSAGES = "section[aria-label]";
const PANEL = "main aside";
const MESSAGE_BOX = "main form";
const MAIN = "main";
const ENTRIES = [
  'article[tabindex="0"], a[tabindex="0"]',
  'a[data-feed-row][aria-current="page"]',
  "a[data-feed-row]",
  "textarea",
  'a[href], button, input, select, [tabindex]:not([tabindex="-1"])',
] as const;
const STEPS = { next: 1, previous: -1 } as const;
const ENDS = { next: 0, previous: -1 } as const;
const NOT_FOUND = -1;
const NONE = 0;

type Step = keyof typeof STEPS;

interface RegionKeys {
  readonly remember: (target: unknown) => void;
  readonly actions: Readonly<Record<"nextRegion" | "previousRegion", Act>>;
}

function outsidePanel(selector: string): Element | null {
  for (const each of globalThis.document.querySelectorAll(selector)) {
    if (each.closest("aside") === null) {
      return each;
    }
  }
  return null;
}

function messagesRegion(): Element | null {
  const feed = outsidePanel(FEED) ?? outsidePanel(ROW);
  if (feed === null) {
    return globalThis.document.querySelector(MAIN);
  }
  return feed.closest(MESSAGES) ?? feed;
}

function isShown(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > NONE;
}

function regionsShown(): readonly HTMLElement[] {
  const { document } = globalThis;
  const shown: HTMLElement[] = [];
  for (const region of [document.querySelector(SIDEBAR), messagesRegion(), document.querySelector(PANEL)]) {
    if (isShown(region)) {
      shown.push(region);
    }
  }
  return shown;
}

function holds(region: unknown, element: unknown): element is HTMLElement {
  return region instanceof Node && element instanceof HTMLElement && region.contains(element);
}

interface Moving {
  readonly regions: readonly unknown[];
  readonly target: unknown;
  readonly step: Step;
}

function columnOf(target: unknown): unknown {
  if (holds(outsidePanel(MESSAGE_BOX), target)) {
    return messagesRegion();
  }
  return target;
}

function indexHolding({ regions, target }: Omit<Moving, "step">): number {
  const within = columnOf(target);
  let at = NOT_FOUND;
  for (const [index, region] of regions.entries()) {
    if (holds(region, within)) {
      at = index;
    }
  }
  return at;
}

function beside(moving: Moving): unknown {
  const { regions, step } = moving;
  const at = indexHolding(moving);
  if (at === NOT_FOUND) {
    return regions.at(ENDS[step]);
  }
  return regions.at((at + STEPS[step]) % regions.length);
}

function createRegionKeys(): RegionKeys {
  const last = new WeakMap<HTMLElement, unknown>();
  function move(step: Step): Act {
    return ({ target }) => {
      const region = beside({ regions: regionsShown(), step, target });
      if (!(region instanceof HTMLElement)) {
        return false;
      }
      const entries: unknown[] = [last.get(region)];
      for (const entry of ENTRIES) {
        entries.push(...region.querySelectorAll(entry));
      }
      return entries.some((each) => {
        if (!holds(region, each)) {
          return false;
        }
        each.focus();
        return globalThis.document.activeElement === each;
      });
    };
  }
  return {
    actions: { nextRegion: move("next"), previousRegion: move("previous") },
    remember: (target) => {
      for (const region of regionsShown()) {
        if (holds(region, target)) {
          last.set(region, target);
        }
      }
    },
  };
}

export { createRegionKeys };

const FOCUSABLE = ["a[href]", "button:not(:disabled)"] as const;
const FIRST = 0;
const ONE = 1;
const LAST = -1;

interface CardFocus {
  readonly mark: string;
  readonly allows: (open: boolean) => boolean;
  readonly blurred: () => void;
  readonly enter: () => void;
  readonly backToName: () => void;
  readonly holdsFocus: () => boolean;
  readonly atEdge: (backwards: boolean) => boolean;
}

function boxOf(mark: string): string {
  return `[data-identity-card-box="${mark}"]`;
}

function stopsIn(mark: string): readonly HTMLElement[] {
  const selector = FOCUSABLE.map((stop) => `${boxOf(mark)} ${stop}`).join(", ");
  return [...globalThis.document.querySelectorAll<HTMLElement>(selector)];
}

function holds(mark: string): boolean {
  return globalThis.document.querySelector(`${boxOf(mark)}:focus-within`) !== null;
}

function edgeOf(mark: string, backwards: boolean): HTMLElement | undefined {
  if (backwards) {
    return stopsIn(mark).at(FIRST);
  }
  return stopsIn(mark).at(LAST);
}

function createCardFocus(mark: string): CardFocus {
  let keptClosed = false;
  let entering = false;
  return {
    allows: (open) => {
      if (open) {
        return !keptClosed;
      }
      return !entering && !holds(mark);
    },
    atEdge: (backwards) => edgeOf(mark, backwards) === globalThis.document.activeElement,
    backToName: () => {
      keptClosed = true;
      const name = globalThis.document.querySelector(`[data-identity-card="${mark}"]`);
      if (name instanceof HTMLElement) {
        name.focus();
      }
    },
    blurred: () => {
      keptClosed = false;
    },
    enter: () => {
      for (const first of stopsIn(mark).slice(FIRST, ONE)) {
        entering = true;
        first.focus();
        entering = false;
      }
    },
    holdsFocus: () => holds(mark),
    mark,
  };
}

export { createCardFocus };
export type { CardFocus };

import type { Act, Keymap } from "../../keymap/index.ts";
import { useEffect, useState } from "react";
import type { IdentityName } from "../../sdk/index.ts";

const PEOPLE = 'ul[aria-label="Identities"]';
const ROWS = `${PEOPLE} > li a[href]`;
const STEPS = { next: 1, previous: -1 } as const;
const FIRST = 0;
const NOT_FOUND = -1;

interface PeopleKeysOf {
  readonly keymap: Keymap;
  readonly shown: readonly IdentityName[];
  readonly open: IdentityName | null;
}

interface Moved {
  readonly name: IdentityName;
  readonly open: IdentityName | null;
}

interface Shown {
  readonly shown: readonly IdentityName[];
  readonly open: IdentityName | null;
  readonly moved: Moved | null;
}

interface Stepping {
  readonly shown: readonly IdentityName[];
  readonly open: IdentityName | null;
  readonly moved: (to: Moved) => void;
}

function peopleList(): Element | null {
  return globalThis.document.querySelector(PEOPLE);
}

function rows(): readonly Element[] {
  return [...globalThis.document.querySelectorAll(ROWS)];
}

function beside(by: number): number {
  let at = 0;
  for (const row of rows()) {
    if (row.matches(":focus")) {
      return at + by;
    }
    at += STEPS.next;
  }
  return NOT_FOUND;
}

function step({ moved, open, shown }: Stepping, by: number): Act {
  return () => {
    const at = beside(by);
    const row = rows()[at] ?? null;
    const name = shown[at] ?? null;
    if (!(row instanceof HTMLElement) || name === null) {
      return false;
    }
    moved({ name, open });
    row.focus();
    return true;
  };
}

function stillMoved({ moved, open, shown }: Shown): IdentityName | null {
  if (moved === null || moved.open !== open) {
    return null;
  }
  return shown.find((name) => name === moved.name) ?? null;
}

function tabbableOf(choosing: Shown): IdentityName | null {
  const { open, shown } = choosing;
  return stillMoved(choosing) ?? shown.find((name) => name === open) ?? shown[FIRST] ?? null;
}

function usePeopleKeys(keys: PeopleKeysOf): IdentityName | null {
  const { keymap, open, shown } = keys;
  const [moved, setMoved] = useState<Moved | null>(null);
  useEffect(() => {
    const stepping = { moved: setMoved, open, shown };
    return keymap.bind({
      actions: { nextPerson: step(stepping, STEPS.next), previousPerson: step(stepping, STEPS.previous) },
      scope: "people list",
      within: peopleList,
    });
  }, [keymap, open, shown]);
  return tabbableOf({ moved, open, shown });
}

export { usePeopleKeys };

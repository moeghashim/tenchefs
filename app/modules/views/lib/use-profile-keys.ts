import type { Keymap } from "../../keymap/index.ts";
import { useEffect } from "react";

const PANEL = 'aside[aria-label="Profile"]';
const FIELD = "input, select, textarea";

interface ProfileKeys {
  readonly closeHref: string;
  readonly keymap: Keymap;
}

function leftField({ target }: KeyboardEvent): boolean {
  if (!(target instanceof HTMLElement) || !target.matches(FIELD)) {
    return false;
  }
  const panel = target.closest<HTMLElement>(PANEL);
  if (panel === null) {
    return false;
  }
  panel.focus();
  return true;
}

function useProfileKeys({ closeHref, keymap }: ProfileKeys): void {
  useEffect(
    () =>
      keymap.bind({
        actions: {
          closeProfile: () => {
            globalThis.location.hash = closeHref;
            return true;
          },
          leaveProfileField: leftField,
        },
        scope: "profile panel",
      }),
    [closeHref, keymap],
  );
}

export { useProfileKeys };

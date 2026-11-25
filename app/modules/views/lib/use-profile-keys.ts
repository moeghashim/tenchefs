import type { Keymap } from "../../keymap/index.ts";
import { useEffect } from "react";

interface ProfileKeys {
  readonly closeHref: string;
  readonly keymap: Keymap;
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
        },
        scope: "profile panel",
      }),
    [closeHref, keymap],
  );
}

export { useProfileKeys };

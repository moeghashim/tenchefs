import type { Keymap } from "../../keymap/index.ts";
import { useEffect } from "react";

interface PromptKeys {
  readonly keymap: Keymap;
  readonly label: string;
  readonly onEscape: () => void;
}

function usePromptKeys({ keymap, label, onEscape }: PromptKeys): string {
  useEffect(
    () =>
      keymap.bind({
        actions: {
          cancelPrompt: () => {
            onEscape();
            return true;
          },
        },
        scope: "prompt form",
        within: () => globalThis.document.querySelector(`form[aria-label="${CSS.escape(label)}"]`),
      }),
    [keymap, label, onEscape],
  );
  return label;
}

export { type PromptKeys, usePromptKeys };

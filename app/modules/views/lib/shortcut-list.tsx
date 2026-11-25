import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { ShortcutList } from "../../design-system/controls.tsx";
import { useSyncExternalStore } from "react";

const TEXT = {
  description: "Single keys work when you aren't typing in a box. Keys with Ctrl, Cmd or Alt work everywhere.",
  title: "Keyboard shortcuts",
} as const;

export function ShortcutListView(props: { readonly keymap: Keymap }): ReactNode {
  const { keymap } = props;
  const state = useSyncExternalStore(keymap.subscribe, keymap.snapshot);
  const handleClose = keymap.closeShortcutList;
  return (
    <ShortcutList
      description={TEXT.description}
      groups={state.shortcutList}
      onClose={handleClose}
      open={state.shortcutListOpen}
      title={TEXT.title}
    />
  );
}

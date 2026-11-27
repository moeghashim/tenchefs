import type { Act, Action, Keymap } from "../../keymap/index.ts";

const VIEWER = "[data-image-viewer]";

function imageViewer(): Element | null {
  return globalThis.document.querySelector(VIEWER);
}

function step(keymap: Keymap, action: Action): Act {
  return () => {
    const { keys } = keymap.shortcutOf(action);
    const button = globalThis.document.querySelector<HTMLElement>(`${VIEWER} button[aria-keyshortcuts="${keys}"]`);
    if (button !== null) {
      button.click();
    }
    return true;
  };
}

function bindImageViewerKeys(keymap: Keymap): () => void {
  return keymap.bind({
    actions: { nextImage: step(keymap, "nextImage"), previousImage: step(keymap, "previousImage") },
    scope: "image viewer",
    within: imageViewer,
  });
}

export { bindImageViewerKeys };

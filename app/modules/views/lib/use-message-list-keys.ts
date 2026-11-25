import { closeThread, messageActions, threadPanel } from "./message-keys.ts";
import type { Keymap } from "../../keymap/index.ts";
import { MESSAGE_LIST_ACTIONS } from "./message-list-keys.ts";
import { createMessageBoxKeys } from "./message-box-keys.ts";
import { useEffect } from "react";

export function useMessageListKeys(keymap: Keymap): void {
  useEffect(() => {
    const box = createMessageBoxKeys();
    const { document } = globalThis;
    function remember(event: Readonly<Event>): void {
      box.remember(event.target, Reflect.get(event, "relatedTarget"));
    }
    document.addEventListener("focusin", remember);
    const unbind = [
      keymap.bind({ actions: MESSAGE_LIST_ACTIONS, scope: "message list" }),
      keymap.bind({ actions: messageActions(keymap), scope: "message" }),
      keymap.bind({ actions: box.actions, scope: "text box" }),
      keymap.bind({ actions: { closeThread }, scope: "thread panel", within: threadPanel }),
    ];
    return (): void => {
      document.removeEventListener("focusin", remember);
      for (const each of unbind) {
        each();
      }
    };
  }, [keymap]);
}

import { MessageActions, MessageKeys } from "../../design-system/messages.tsx";
import { MessageChoices, createMessageActions } from "./message-actions.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { messageShortcutsOf } from "./person-keys.ts";
import { useMemo } from "react";

interface MessageKeysAreaProps {
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function MessageKeysArea(props: MessageKeysAreaProps): ReactNode {
  const { keymap } = props;
  const shortcuts = useMemo(() => messageShortcutsOf(keymap), [keymap]);
  const actions = useMemo(() => createMessageActions(), []);
  return (
    <MessageKeys value={shortcuts}>
      <MessageActions value={actions}>
        <MessageChoices value={actions}>{props.children}</MessageChoices>
      </MessageActions>
    </MessageKeys>
  );
}

import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { useMessageListKeys } from "./use-message-list-keys.ts";

interface MessageListKeysProps {
  readonly keymap: Keymap;
}

export function MessageListKeys(props: MessageListKeysProps): ReactNode {
  useMessageListKeys(props.keymap);
  return null;
}

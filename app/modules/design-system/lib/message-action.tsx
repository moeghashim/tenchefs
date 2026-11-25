import { HoverAction } from "./hover-action.tsx";
import { HoverButton } from "./hover-button.tsx";
import { MessageKeys } from "./message-keys-parts.ts";
import type { ReactNode } from "react";
import { ReplyIcon } from "./reply-icon.tsx";
import { useContext } from "react";

interface MessageActionParts {
  readonly actionHref: string | null;
  readonly actionLabel: string;
  readonly onAction: (() => void) | null;
}

export function MessageAction(parts: MessageActionParts): ReactNode {
  const { actionHref, onAction } = parts;
  const { keys } = useContext(MessageKeys).reply;
  if (actionHref !== null) {
    return (
      <HoverAction href={actionHref} keys={keys} name={parts.actionLabel}>
        <ReplyIcon />
      </HoverAction>
    );
  }
  const handleAction = onAction;
  return (
    handleAction !== null && (
      <HoverButton keys={keys} name={parts.actionLabel} onClick={handleAction}>
        <ReplyIcon />
      </HoverButton>
    )
  );
}

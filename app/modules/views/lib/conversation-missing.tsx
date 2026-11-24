import { CardBody, ConversationPanel, Muted } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";

const TEXT = {
  back: "Back to the inbox",
  conversation: "Conversation",
  nothing: "Nothing here",
  open: "Open thread",
} as const;

export function ConversationMissing(): ReactNode {
  return (
    <ConversationPanel
      backHref={hrefOf({ name: "inbox", selected: null })}
      backLabel={TEXT.back}
      detail=""
      edge={null}
      label={TEXT.conversation}
      message={null}
      openHref={null}
      openLabel={TEXT.open}
    >
      <CardBody>
        <Muted>{TEXT.nothing}</Muted>
      </CardBody>
    </ConversationPanel>
  );
}

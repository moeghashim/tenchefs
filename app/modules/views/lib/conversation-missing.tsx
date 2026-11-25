import { CardBody, ConversationPanel } from "../../design-system/layout.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";

const TEXT = {
  back: "Back to the inbox",
  conversation: "Conversation",
  nothing: "Nothing here",
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
      open={null}
    >
      <CardBody>
        <Muted>{TEXT.nothing}</Muted>
      </CardBody>
    </ConversationPanel>
  );
}

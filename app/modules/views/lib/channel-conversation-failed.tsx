import { Alert, Muted } from "../../design-system/content.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { Refusal } from "../../sdk/index.ts";

const NOTHING = "Nothing here";
const NOT_FOUND = "channel_not_found";

interface ChannelConversationFailedProps {
  readonly refusal: Refusal;
}

export function ChannelConversationFailed(props: ChannelConversationFailedProps): ReactNode {
  const { code, message } = props.refusal;
  if (code === NOT_FOUND) {
    return (
      <CardBody>
        <Muted>{NOTHING}</Muted>
      </CardBody>
    );
  }
  return <Alert>{`Couldn't load the conversation (${code}): ${message}`}</Alert>;
}

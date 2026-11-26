import type { Message } from "../../sdk/index.ts";
import { MessageData } from "./message-data.tsx";
import { MessageReactions } from "./message-reactions.tsx";
import type { ReactNode } from "react";
import { useFold } from "./use-fold.ts";

interface MessageContentProps {
  readonly me: string;
  readonly message: Message;
  readonly opened: boolean;
}

export function MessageContent(props: MessageContentProps): ReactNode {
  const fold = useFold({ me: props.me, message: props.message, opened: props.opened });
  return (
    <>
      <MessageData fold={fold} me={props.me} message={props.message} />
      <MessageReactions me={props.me} message={props.message} />
    </>
  );
}

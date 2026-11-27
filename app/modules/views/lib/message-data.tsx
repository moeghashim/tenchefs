import { CallChip, DataToggle, MessageBody } from "../../design-system/messages.tsx";
import type { JsonValue, Message } from "../../sdk/index.ts";
import type { Fold } from "./use-fold.ts";
import { MarkdownText } from "./markdown-text.tsx";
import { MessageAttachments } from "./message-attachments.tsx";
import type { ReactNode } from "react";

const TEXT = { data: "Data" } as const;

interface MessageDataProps {
  readonly message: Message;
  readonly me: string;
  readonly fold: Fold;
}

interface Call {
  readonly webhookCommand: string;
  readonly value: JsonValue;
}

function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function callIn(data: JsonValue): Call | null {
  if (isJsonObject(data) && typeof data["command"] === "string") {
    return { value: data["data"] ?? null, webhookCommand: data["command"] };
  }
  return null;
}

function callOf(message: Message): Call | null {
  const call = callIn(message.data ?? null);
  if (call === null || message.text !== `/${call.webhookCommand}`) {
    return null;
  }
  return call;
}

export function MessageData(props: MessageDataProps): ReactNode {
  const { message } = props;
  const { data = null } = message;
  const call = callOf(message);
  const handleUnfold = props.fold.unfold;
  if (call !== null) {
    return <CallChip webhookCommand={message.text} label={`Call to /${call.webhookCommand}`} value={call.value} />;
  }
  return (
    <>
      <MessageBody foldable={props.fold.foldable} onUnfold={handleUnfold}>
        <MarkdownText me={props.me} message={message} />
      </MessageBody>
      <MessageAttachments linked message={message} />
      {data !== null && <DataToggle label={TEXT.data} value={data} />}
    </>
  );
}

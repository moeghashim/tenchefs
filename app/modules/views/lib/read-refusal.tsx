import { Alert } from "../../design-system/content.tsx";
import type { ChannelMessagesState } from "../../board/index.ts";
import type { ReactNode } from "react";

type ReadState = Extract<ChannelMessagesState, { readonly status: "loaded" }>["read"];

interface ReadRefusalProps {
  readonly read: ReadState;
}

export function ReadRefusal(props: ReadRefusalProps): ReactNode {
  const { read } = props;
  if (read.status !== "failed") {
    return null;
  }
  return <Alert>{`Couldn't mark the channel read (${read.code}): ${read.message}`}</Alert>;
}

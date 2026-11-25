import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { TriggerResult } from "../../sdk/index.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const TEXT = {
  failed: "Last call failed: ",
  succeeded: "Last call answered ",
} as const;

interface TriggerLastCallProps {
  readonly result: TriggerResult;
}

function answerOf({ error, status }: TriggerResult): string {
  if (typeof status === "number") {
    return `HTTP ${String(status)}`;
  }
  return error ?? "";
}

function outcomeOf(result: TriggerResult): string {
  if (result.ok) {
    return `${TEXT.succeeded}${answerOf(result)}`;
  }
  return `${TEXT.failed}${answerOf(result)}`;
}

export function TriggerLastCall(props: TriggerLastCallProps): ReactNode {
  const ago = useTimeAgo(props.result.at);
  return <Muted>{`${outcomeOf(props.result)}, ${ago}`}</Muted>;
}

import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { TriggerResult } from "../../sdk/index.ts";
import { answerTextOf } from "./trigger-answer.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const TEXT = {
  failed: "Last call failed: ",
  skippedLive: "Last mention called nothing: the agent was joined",
  succeeded: "Last call answered ",
} as const;

interface TriggerLastCallProps {
  readonly result: TriggerResult;
}

function answerOf(result: TriggerResult): string {
  return answerTextOf({ answer: result, silent: "" });
}

function outcomeOf(result: TriggerResult): string {
  if (result.skipped === "agent_session_live") {
    return TEXT.skippedLive;
  }
  if (result.ok) {
    return `${TEXT.succeeded}${answerOf(result)}`;
  }
  return `${TEXT.failed}${answerOf(result)}`;
}

export function TriggerLastCall(props: TriggerLastCallProps): ReactNode {
  const ago = useTimeAgo(props.result.at);
  return <Muted>{`${outcomeOf(props.result)}, ${ago}`}</Muted>;
}

import type { Trigger, TriggerResult } from "../../sdk/index.ts";
import { Muted } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { TriggerLastCall } from "./trigger-last-call.tsx";
import type { TriggerSnapshot } from "../../composer/index.ts";

const TEXT = {
  never: "Not called yet.",
  none: "No trigger URL: a mention calls nothing.",
} as const;

interface TriggerResultLineProps {
  readonly loaded: TriggerSnapshot["loaded"];
}

function triggerOf(loaded: TriggerSnapshot["loaded"]): Trigger | null {
  if (loaded.status === "loading") {
    return null;
  }
  return loaded.trigger;
}

function lastResultOf(trigger: Trigger): TriggerResult | null {
  return trigger.lastResult ?? null;
}

export function TriggerResultLine(props: TriggerResultLineProps): ReactNode {
  const trigger = triggerOf(props.loaded);
  if (props.loaded.status === "loading") {
    return null;
  }
  if (trigger === null) {
    return <Muted>{TEXT.none}</Muted>;
  }
  const result = lastResultOf(trigger);
  if (result === null) {
    return <Muted>{TEXT.never}</Muted>;
  }
  return <TriggerLastCall result={result} />;
}

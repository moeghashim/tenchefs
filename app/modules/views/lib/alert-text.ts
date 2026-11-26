import type { OfflineAlert, TriggerFailure } from "../../sdk/index.ts";
import { answerTextOf } from "./trigger-answer.ts";

const TEXT = {
  backOnline: "Back online ",
  reachedAgain: "Reached again ",
  stillOffline: "Still offline",
  stillUnreachable: "Still unreachable",
} as const;

function outcomeOf(failure: TriggerFailure): string {
  return answerTextOf({ answer: failure, silent: "no answer" });
}

function alertTextOf(alert: OfflineAlert): string {
  const trigger = alert.trigger ?? null;
  if (trigger === null) {
    return `@${alert.agent} went offline: ${alert.offlineReason}`;
  }
  const message = String(trigger.message);
  return `@${alert.agent} is unreachable: its trigger URL answered ${outcomeOf(trigger)} to message ${message}`;
}

function triggerBackText(alert: OfflineAlert, ago: string): string {
  if ("backOnlineAt" in alert) {
    return `${TEXT.reachedAgain}${ago}`;
  }
  return TEXT.stillUnreachable;
}

interface Back {
  readonly alert: OfflineAlert;
  readonly ago: string;
}

function backTextOf({ ago, alert }: Back): string {
  if (alert.offlineReason === "trigger failed") {
    return triggerBackText(alert, ago);
  }
  if ("backOnlineAt" in alert) {
    return `${TEXT.backOnline}${ago}`;
  }
  return TEXT.stillOffline;
}

export { alertTextOf, backTextOf };

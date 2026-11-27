import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useWebhookCommands } from "./use-board.ts";

export function WebhookCommandsRefusal(): ReactNode {
  const listed = useWebhookCommands();
  if (listed.status !== "failed") {
    return null;
  }
  return <Alert>{`Couldn't list the webhook commands (${listed.code}): ${listed.message}`}</Alert>;
}

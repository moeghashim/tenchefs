import type { CommandRun, Draft } from "../../composer/index.ts";
import type { WebhookCommandCalls } from "./use-board.ts";
import { useCallback } from "react";

type WebhookCommandRun = Exclude<CommandRun, { readonly kind: "command" }>;

interface WebhookCommandRunning {
  readonly calls: WebhookCommandCalls;
  readonly draft: Draft;
  readonly saved: () => void;
}

function useWebhookCommandRun({ calls, draft, saved }: WebhookCommandRunning): (run: WebhookCommandRun) => void {
  const { call, editCallData } = calls;
  return useCallback(
    (run: WebhookCommandRun) => {
      const { name } = run.webhookCommand;
      function opened(): void {
        draft.openWebhookCommand(name);
      }
      if (run.kind === "form") {
        editCallData("");
        opened();
        return;
      }
      const data = JSON.stringify({ [run.field]: run.text });
      editCallData(data);
      call({ called: saved, data, refused: opened, webhookCommand: name });
    },
    [call, draft, editCallData, saved],
  );
}

export { useWebhookCommandRun };

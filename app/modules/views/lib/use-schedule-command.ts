import { MessageActions, MessageKeys } from "../../design-system/messages.tsx";
import type { Outgoing, Scheduling } from "../../board/index.ts";
import { useCallback, useContext, useEffect } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { Draft } from "../../composer/index.ts";
import type { MenuChoice } from "../../design-system/messages.tsx";
import type { WebhookCommandCalls } from "./use-board.ts";
import { useChannelCalls } from "./use-board.ts";
import { useFooterHandlers } from "./use-footer-handlers.ts";
import { useWebhookCommandRun } from "./use-webhook-command-run.ts";

const SCHEDULE = "Schedule…";

interface ScheduleCommand {
  readonly channel: ChannelName;
  readonly draft: Draft;
  readonly form: string;
  readonly scheduling: Scheduling;
  readonly shown: boolean;
}

interface Offered {
  readonly form: string;
  readonly shown: boolean;
  readonly onSchedule: () => void;
}

function formOf({ form, shown }: Offered): Element | null {
  if (!shown) {
    return null;
  }
  return document.querySelector(`main form[aria-label="${form}"]`);
}

function useScheduleKey(offered: Offered): void {
  const { offer, withdraw } = useContext(MessageActions);
  const { schedule } = useContext(MessageKeys);
  const { form, onSchedule, shown } = offered;
  useEffect(() => {
    const target = formOf({ form, onSchedule, shown });
    const choices: readonly MenuChoice[] = [
      { href: null, icon: "schedule", keys: schedule, label: SCHEDULE, onSelect: onSchedule },
    ];
    offer(target, choices);
    return (): void => {
      withdraw(target);
    };
  }, [form, offer, onSchedule, schedule, shown, withdraw]);
}

function scheduledText(draft: Draft): string {
  const { text } = draft.snapshot();
  const run = draft.commandRun(text);
  if (run === null) {
    return text;
  }
  if (run.kind === "command") {
    return run.text;
  }
  return text;
}

interface Handlers {
  readonly calls: WebhookCommandCalls;
  readonly post: (outgoing: Outgoing, posted: () => void) => void;
  readonly saved: () => void;
}

export function useScheduleCommand(command: ScheduleCommand): Handlers {
  const { channel, draft, scheduling } = command;
  const { post, saved } = useFooterHandlers({ channel, draft, form: command.form });
  const calls = useChannelCalls(channel);
  const runWebhookCommand = useWebhookCommandRun({ calls, draft, saved });
  const handleSchedule = useCallback(() => {
    scheduling.open({ channel, thread: null }, scheduledText(draft));
  }, [channel, draft, scheduling]);
  useScheduleKey({ form: command.form, onSchedule: handleSchedule, shown: command.shown });
  const handlePost = useCallback(
    (outgoing: Outgoing, posted: () => void) => {
      const run = draft.commandRun(outgoing.text);
      if (run === null) {
        post(outgoing, posted);
      } else if (run.kind === "command") {
        scheduling.open({ channel, thread: null }, run.text);
      } else {
        runWebhookCommand(run);
      }
    },
    [channel, draft, post, runWebhookCommand, scheduling],
  );
  return { calls, post: handlePost, saved };
}

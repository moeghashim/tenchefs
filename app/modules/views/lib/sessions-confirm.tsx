import { questionOf, refusalWords } from "./sessions-words.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import type { SessionList } from "../../board/index.ts";
import { useSyncExternalStore } from "react";

interface SessionsConfirmProps {
  readonly sessionList: SessionList;
}

export function SessionsConfirm(props: SessionsConfirmProps): ReactNode {
  const { sessionList } = props;
  const state = useSyncExternalStore(sessionList.subscribe, sessionList.snapshot);
  const handleCancel = sessionList.cancel;
  const handleConfirm = sessionList.confirm;
  if (state.asked === null) {
    return null;
  }
  const question = questionOf(state.asked);
  return (
    <ConfirmDialog
      body={question.body}
      confirm={question.confirm}
      destructive
      error={refusalWords(state)}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      open
      pending={state.action.status === "sending"}
      returnTo={null}
      title={question.title}
    />
  );
}

import { questionOf, refusalOf } from "./identity-questions.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const AFTER_DELETE = "main h1";

function returnToOf(confirming: string | null): string | null {
  if (confirming === "delete") {
    return AFTER_DELETE;
  }
  return null;
}

interface IdentityConfirmProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
  readonly onCloseFocused?: (() => void) | undefined;
}

export function IdentityConfirm(props: IdentityConfirmProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const question = questionOf({ identity: props.identity, state });
  const handleConfirm = actions.confirm;
  const handleCancel = actions.cancel;
  const handleCloseFocused = props.onCloseFocused;
  return (
    <ConfirmDialog
      body={question.body}
      confirm={question.confirm}
      destructive={question.destructive}
      error={refusalOf(state)}
      onCancel={handleCancel}
      onCloseFocused={handleCloseFocused}
      onConfirm={handleConfirm}
      open={state.confirming !== null}
      pending={state.action.status === "sending"}
      returnTo={returnToOf(state.confirming)}
      title={question.title}
    />
  );
}

import { questionOf, refusalOf } from "./identity-questions.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface IdentityConfirmProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
}

export function IdentityConfirm(props: IdentityConfirmProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const question = questionOf({ identity: props.identity, state });
  const handleConfirm = actions.confirm;
  const handleCancel = actions.cancel;
  return (
    <ConfirmDialog
      body={question.body}
      confirm={question.confirm}
      destructive={question.destructive}
      error={refusalOf(state)}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      open={state.confirming !== null}
      pending={state.action.status === "sending"}
      title={question.title}
    />
  );
}

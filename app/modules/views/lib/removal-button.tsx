import type { IdentityActions, MessageCount } from "../../composer/index.ts";
import { ActivationButton } from "./activation-button.tsx";
import { Button } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NO_MESSAGES = 0;

const TEXT = { deactivate: "Deactivate", delete: "Delete" } as const;

interface RemovalButtonProps {
  readonly actions: IdentityActions;
  readonly active: boolean;
  readonly deletable: boolean;
}

function subscriptionOf(props: RemovalButtonProps): IdentityActions["subscribe"] {
  if (props.active && props.deletable) {
    return props.actions.subscribeToMessages;
  }
  return props.actions.subscribe;
}

type Shown = "activation" | "delete" | "pending";

function shownOf(props: RemovalButtonProps, messages: MessageCount): Shown {
  if (!props.active || !props.deletable) {
    return "activation";
  }
  if (messages === "loading") {
    return "pending";
  }
  if (messages === NO_MESSAGES) {
    return "delete";
  }
  return "activation";
}

export function RemovalButton(props: RemovalButtonProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(subscriptionOf(props), actions.snapshot);
  const shown = shownOf(props, state.messages);
  const handleDelete = actions.ask.delete;
  const handleDeactivate = actions.ask.deactivate;
  if (shown === "pending") {
    return (
      <Button disabled onClick={handleDeactivate}>
        {TEXT.deactivate}
      </Button>
    );
  }
  if (shown === "activation") {
    return <ActivationButton actions={actions} active={props.active} />;
  }
  return (
    <Button disabled={state.action.status === "sending"} onClick={handleDelete}>
      {TEXT.delete}
    </Button>
  );
}

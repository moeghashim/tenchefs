import { Button } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { deactivate: "Deactivate", reactivate: "Reactivate" } as const;

interface ActivationButtonProps {
  readonly actions: IdentityActions;
  readonly active: boolean;
}

export function ActivationButton(props: ActivationButtonProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const sending = state.action.status === "sending";
  const handleDeactivate = actions.ask.deactivate;
  const handleReactivate = actions.ask.reactivate;
  if (props.active) {
    return (
      <Button disabled={sending} onClick={handleDeactivate}>
        {TEXT.deactivate}
      </Button>
    );
  }
  return (
    <Button disabled={sending} onClick={handleReactivate}>
      {TEXT.reactivate}
    </Button>
  );
}

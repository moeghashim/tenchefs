import { Button } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { rotate: "Rotate token" } as const;

interface RotateButtonProps {
  readonly actions: IdentityActions;
}

export function RotateButton(props: RotateButtonProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleRotate = actions.ask.rotate;
  return (
    <Button disabled={state.action.status === "sending"} focused={state.tokenForgotten} onClick={handleRotate}>
      {TEXT.rotate}
    </Button>
  );
}

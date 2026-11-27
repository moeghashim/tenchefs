import { Button } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ListedAgentSession } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NONE = 0;
const NO_SESSIONS: readonly ListedAgentSession[] = [];

const TEXT = { revoke: "Revoke session" } as const;

interface RevokeButtonProps {
  readonly actions: IdentityActions;
}

export function RevokeButton(props: RevokeButtonProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleRevoke = actions.ask.revoke;
  if ((state.sessions ?? NO_SESSIONS).length === NONE) {
    return null;
  }
  return (
    <Button disabled={state.action.status === "sending"} onClick={handleRevoke}>
      {TEXT.revoke}
    </Button>
  );
}

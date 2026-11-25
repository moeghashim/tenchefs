import { AgentButtons } from "./agent-buttons.tsx";
import { ButtonRow } from "../../design-system/controls.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { RemovalButton } from "./removal-button.tsx";

interface ActionButtonsProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
  readonly deletable: boolean;
}

export function ActionButtons(props: ActionButtonsProps): ReactNode {
  const { actions, identity } = props;
  const active = identity.deactivated !== true;
  return (
    <ButtonRow>
      {active && identity.kind === "agent" && <AgentButtons actions={actions} />}
      <RemovalButton actions={actions} active={active} deletable={props.deletable} />
    </ButtonRow>
  );
}

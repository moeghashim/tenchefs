import { ButtonRow } from "../../design-system/controls.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import type { ReactNode } from "react";
import { RemovalButton } from "./removal-button.tsx";
import { RotateButton } from "./rotate-button.tsx";
import { TokenShown } from "./token-shown.tsx";
import { TransferForm } from "./transfer-form.tsx";

interface ManageActionsProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
  readonly deletable: boolean;
  readonly transfer: boolean;
}

export function ManageActions(props: ManageActionsProps): ReactNode {
  const { actions, identity } = props;
  const active = identity.deactivated !== true;
  return (
    <>
      <ButtonRow>
        {active && identity.kind === "agent" && <RotateButton actions={actions} />}
        <RemovalButton actions={actions} active={active} deletable={props.deletable} />
      </ButtonRow>
      <IdentityConfirm actions={actions} identity={identity} />
      <TokenShown actions={actions} />
      {props.transfer && <TransferForm actions={actions} name={identity.name} />}
    </>
  );
}

import type { IdentityActions } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { LineForm } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { field: "Transfer to (a human's name)", submit: "Transfer" } as const;

interface TransferFormProps {
  readonly actions: IdentityActions;
  readonly name: IdentityName;
}

export function TransferForm(props: TransferFormProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleEdit = actions.editTransfer;
  const handleTransfer = actions.ask.transfer;
  return (
    <LineForm
      field={TEXT.field}
      label={`Transfer @${props.name}`}
      onEdit={handleEdit}
      onSubmit={handleTransfer}
      saving={state.action.status === "sending"}
      submit={TEXT.submit}
      value={state.transferTo}
    />
  );
}

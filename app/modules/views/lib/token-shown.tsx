import { Button, ButtonRow, TokenText } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = {
  copy: "Copy token",
  done: "Done",
  label: "New Identity token",
  warning: "Copy it now: it isn't shown again, and the old token stops working.",
} as const;

interface TokenShownProps {
  readonly actions: IdentityActions;
}

export function TokenShown(props: TokenShownProps): ReactNode {
  const { actions } = props;
  const { token } = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleDone = actions.forgetToken;
  const handleCopy = actions.copyToken;
  if (token === null) {
    return null;
  }
  return (
    <>
      <TokenText label={TEXT.label} token={token} />
      <Muted>{TEXT.warning}</Muted>
      <ButtonRow>
        <Button focused onClick={handleCopy}>
          {TEXT.copy}
        </Button>
        <Button onClick={handleDone}>{TEXT.done}</Button>
      </ButtonRow>
    </>
  );
}

import { Button, TokenText } from "../../design-system/controls.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { WebLoginState } from "../../board/index.ts";

const TEXT = { back: "Back", code: "Code", waiting: "Waiting for approval…" } as const;

interface WebLoginWaitingProps {
  readonly waiting: Extract<WebLoginState, { readonly status: "waiting" }>;
  readonly onBack: () => void;
}

export function WebLoginWaiting(props: WebLoginWaitingProps): ReactNode {
  const { approvalUrl, expiresAt, userCode } = props.waiting;
  const handleBack = props.onBack;
  return (
    <CardBody>
      <TokenText label={TEXT.code} token={userCode} />
      <Muted>{`Type it at ${approvalUrl} on a logged-in device, or run \`cookout login approve ${userCode}\` there.`}</Muted>
      <Muted>{`The code lasts until ${expiresAt}.`}</Muted>
      <Muted>{TEXT.waiting}</Muted>
      <Button focused onClick={handleBack}>
        {TEXT.back}
      </Button>
    </CardBody>
  );
}

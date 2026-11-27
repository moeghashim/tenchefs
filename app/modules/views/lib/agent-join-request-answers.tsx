import type { AgentJoinApproval, AgentJoinApprovalState } from "../../board/index.ts";
import { Button, ButtonRow } from "../../design-system/controls.tsx";
import { useCallback, useContext } from "react";
import { LandingContext } from "../../landing/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const TEXT = {
  approve: "Approve",
  dismiss: "Dismiss",
  dismissed: "Dismissed. The waiting join stops; you can close this page.",
} as const;

const HEADING = "main h1";

type ShownState = Extract<AgentJoinApprovalState, { readonly idleExpiry: string }>;

interface AgentJoinRequestAnswersProps {
  readonly approval: AgentJoinApproval;
  readonly state: ShownState;
}

function approvedText({ agentJoinRequest }: ShownState): string {
  return `Approved, with an idle expiry of ${agentJoinRequest.idleExpiry}. The box finishes joining now; you can close this page.`;
}

function isOpen({ status }: ShownState): boolean {
  return status !== "approved" && status !== "dismissed";
}

function isAnswering({ status }: ShownState): boolean {
  return status === "approving" || status === "dismissing";
}

export function AgentJoinRequestAnswers(props: AgentJoinRequestAnswersProps): ReactNode {
  const { approval, state } = props;
  const { watch } = useContext(LandingContext);
  const handleApprove = useCallback(() => {
    approval.approve();
    watch(HEADING);
  }, [approval, watch]);
  const handleDismiss = useCallback(() => {
    approval.dismiss();
    watch(HEADING);
  }, [approval, watch]);
  const answering = isAnswering(state);
  return (
    <>
      {state.status === "approved" && <Muted>{approvedText(state)}</Muted>}
      {state.status === "dismissed" && <Muted>{TEXT.dismissed}</Muted>}
      {isOpen(state) && (
        <ButtonRow>
          <Button disabled={answering} onClick={handleApprove}>
            {TEXT.approve}
          </Button>
          <Button disabled={answering} onClick={handleDismiss}>
            {TEXT.dismiss}
          </Button>
        </ButtonRow>
      )}
    </>
  );
}

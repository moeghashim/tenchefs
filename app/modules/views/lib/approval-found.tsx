import type { AgentJoinApprovals, ApprovalCode, LoginApprovals } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { LoginApprovalBody } from "./login-approval-body.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const EXAMPLE = "WDJB-MJHT";

interface ApprovalFoundProps {
  readonly approvalCode: ApprovalCode;
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly loginApprovals: LoginApprovals;
}

export function ApprovalFound(props: ApprovalFoundProps): ReactNode {
  const { approvalCode } = props;
  const state = useSyncExternalStore(approvalCode.subscribe, approvalCode.snapshot);
  if (state.status === "empty") {
    return null;
  }
  if (state.status === "malformed") {
    return (
      <CardBody>
        <Alert>{`${state.typed} isn't a code: a code looks like ${EXAMPLE}.`}</Alert>
      </CardBody>
    );
  }
  return (
    <LoginApprovalBody
      agentJoinApprovals={props.agentJoinApprovals}
      approval={props.loginApprovals.forCode(state.code)}
      userCode={state.code}
    />
  );
}

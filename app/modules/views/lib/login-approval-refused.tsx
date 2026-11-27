import { AgentJoinApprovalBody } from "./agent-join-approval-body.tsx";
import type { AgentJoinApprovals } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";

const NOT_A_LOGIN = "login_request_not_found";

interface LoginApprovalRefusedProps {
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly refusal: { readonly code: string; readonly message: string };
  readonly userCode: string;
}

export function LoginApprovalRefused(props: LoginApprovalRefusedProps): ReactNode {
  const { refusal, userCode } = props;
  if (refusal.code === NOT_A_LOGIN) {
    return <AgentJoinApprovalBody approval={props.agentJoinApprovals.forCode(userCode)} userCode={userCode} />;
  }
  return (
    <CardBody>
      <Alert>{`Couldn't show this login (${refusal.code}): ${refusal.message}`}</Alert>
    </CardBody>
  );
}

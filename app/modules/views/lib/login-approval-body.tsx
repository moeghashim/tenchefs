import type { AgentJoinApprovals, LoginApproval } from "../../board/index.ts";
import { useCallback, useContext, useSyncExternalStore } from "react";
import { CardBody } from "../../design-system/layout.tsx";
import { LandingContext } from "../../landing/index.ts";
import { LoginApprovalRefused } from "./login-approval-refused.tsx";
import { LoginRequestShown } from "./login-request-shown.tsx";
import type { ReactNode } from "react";
import { Skeleton } from "../../design-system/content.tsx";

const HEADING = "main h1";

interface LoginApprovalBodyProps {
  readonly approval: LoginApproval;
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly userCode: string;
}

export function LoginApprovalBody(props: LoginApprovalBodyProps): ReactNode {
  const { approval } = props;
  const state = useSyncExternalStore(approval.subscribe, approval.snapshot);
  const { watch } = useContext(LandingContext);
  const handleApprove = useCallback(() => {
    approval.approve();
    watch(HEADING);
  }, [approval, watch]);
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "refused") {
    return (
      <LoginApprovalRefused
        agentJoinApprovals={props.agentJoinApprovals}
        refusal={state.refusal}
        userCode={props.userCode}
      />
    );
  }
  return <LoginRequestShown loginRequest={state.loginRequest} onApprove={handleApprove} status={state.status} />;
}

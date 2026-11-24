import { Alert, CardBody, Skeleton } from "../../design-system/index.tsx";
import type { LoginApproval } from "../../board/index.ts";
import { LoginRequestShown } from "./login-request-shown.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface LoginApprovalBodyProps {
  readonly approval: LoginApproval;
}

export function LoginApprovalBody(props: LoginApprovalBodyProps): ReactNode {
  const { approval } = props;
  const state = useSyncExternalStore(approval.subscribe, approval.snapshot);
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "refused") {
    return (
      <CardBody>
        <Alert>{`Couldn't show this login (${state.refusal.code}): ${state.refusal.message}`}</Alert>
      </CardBody>
    );
  }
  const handleApprove = approval.approve;
  return <LoginRequestShown loginRequest={state.loginRequest} onApprove={handleApprove} status={state.status} />;
}

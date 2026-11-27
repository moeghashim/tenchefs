import { Alert, Skeleton } from "../../design-system/content.tsx";
import { useCallback, useContext, useSyncExternalStore } from "react";
import { CardBody } from "../../design-system/layout.tsx";
import { LandingContext } from "../../landing/index.ts";
import type { LoginApproval } from "../../board/index.ts";
import { LoginRequestShown } from "./login-request-shown.tsx";
import type { ReactNode } from "react";

const HEADING = "main h1";

interface LoginApprovalBodyProps {
  readonly approval: LoginApproval;
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
      <CardBody>
        <Alert>{`Couldn't show this login (${state.refusal.code}): ${state.refusal.message}`}</Alert>
      </CardBody>
    );
  }
  return <LoginRequestShown loginRequest={state.loginRequest} onApprove={handleApprove} status={state.status} />;
}

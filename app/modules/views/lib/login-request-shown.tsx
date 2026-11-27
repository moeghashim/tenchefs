import type { LoginApprovalState, LoginRequest } from "../../board/index.ts";
import { ApprovalRequestDetailsView } from "./approval-request-details.tsx";
import { Button } from "../../design-system/controls.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const TEXT = {
  approve: "Approve",
  approved: "Approved. Your terminal finishes logging in now; you can close this page.",
} as const;

type ShownStatus = Exclude<LoginApprovalState["status"], "loading" | "refused">;

interface LoginRequestShownProps {
  readonly loginRequest: LoginRequest;
  readonly onApprove: () => void;
  readonly status: ShownStatus;
}

export function LoginRequestShown(props: LoginRequestShownProps): ReactNode {
  const { loginRequest, onApprove } = props;
  return (
    <CardBody>
      <ApprovalRequestDetailsView details={loginRequest} />
      <Muted>{`The code lasts until ${loginRequest.expiresAt}.`}</Muted>
      {props.status === "approved" && <Muted>{TEXT.approved}</Muted>}
      {props.status !== "approved" && (
        <Button disabled={props.status === "approving"} onClick={onApprove}>
          {TEXT.approve}
        </Button>
      )}
    </CardBody>
  );
}

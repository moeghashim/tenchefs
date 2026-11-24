import { Button, CardBody, Muted } from "../../design-system/index.tsx";
import type { LoginApprovalState, LoginRequest } from "../../board/index.ts";
import type { ReactNode } from "react";

const TEXT = {
  approve: "Approve",
  approved: "Approved. Your terminal finishes logging in now; you can close this page.",
  code: "Code",
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
      <p aria-label={TEXT.code} className="font-mono text-2xl font-semibold tracking-widest">
        {loginRequest.userCode}
      </p>
      <Muted>{`Requested by ${loginRequest.host}, until ${loginRequest.expiresAt}.`}</Muted>
      {props.status === "approved" && <Muted>{TEXT.approved}</Muted>}
      {props.status !== "approved" && (
        <Button disabled={props.status === "approving"} onClick={onApprove}>
          {TEXT.approve}
        </Button>
      )}
    </CardBody>
  );
}

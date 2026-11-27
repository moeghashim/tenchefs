import { Alert, Muted } from "../../design-system/content.tsx";
import type { Session, SessionState, WebLoginState } from "../../board/index.ts";
import { Button } from "../../design-system/controls.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { LoginForm } from "./login-form.tsx";
import type { ReactNode } from "react";

const TEXT = {
  approve: "💻 Approve from another device",
  approveHow: "Use a browser or terminal where you're already logged in, and type the code we show you there.",
  link: "Got a login link from an admin? Just open it.",
  token: "🔑 Paste your token",
} as const;

type Choosing = Exclude<WebLoginState, { readonly status: "waiting" | "expired" }>;

interface LoginCardsProps {
  readonly session: Session;
  readonly shown: Choosing;
  readonly state: Extract<SessionState, { readonly status: "logged-out" | "logging-in" }>;
}

export function LoginCards(props: LoginCardsProps): ReactNode {
  const { session, shown } = props;
  const handleApprove = session.webLogin.start;
  return (
    <>
      <CardBody>
        <Button disabled={shown.status === "starting"} onClick={handleApprove}>
          {TEXT.approve}
        </Button>
        <Muted>{TEXT.approveHow}</Muted>
        {shown.status === "refused" && (
          <Alert>{`Couldn't start a login (${shown.refusal.code}): ${shown.refusal.message}`}</Alert>
        )}
      </CardBody>
      <CardBody>
        <Muted>{TEXT.token}</Muted>
        <LoginForm session={session} state={props.state} />
      </CardBody>
      <CardBody>
        <Muted>{TEXT.link}</Muted>
      </CardBody>
    </>
  );
}

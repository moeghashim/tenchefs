import { Form, SubmitButton, TextField } from "../../design-system/controls.tsx";
import type { Session, SessionState } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { Refusal } from "../../sdk/index.ts";

const TEXT = {
  button: "Log in",
  ended: "Your login ended after 90 days unused. Log in again.",
  field: "Token",
  form: "Log in",
} as const;

const LOGIN_EXPIRED = "login_expired";

function refusalLine(refusal: Refusal): string {
  if (refusal.code === LOGIN_EXPIRED) {
    return TEXT.ended;
  }
  return `Couldn't log in (${refusal.code}): ${refusal.message}`;
}

interface LoginFormProps {
  readonly session: Session;
  readonly state: Extract<SessionState, { readonly status: "logged-out" | "logging-in" }>;
}

export function LoginForm(props: LoginFormProps): ReactNode {
  const { state } = props;
  const handleLogIn = props.session.logIn;
  return (
    <>
      <Form field="token" flush label={TEXT.form} onSubmit={handleLogIn}>
        <TextField focused label={TEXT.field} name="token" />
        <SubmitButton disabled={state.status === "logging-in"}>{TEXT.button}</SubmitButton>
      </Form>
      {state.status === "logged-out" && state.refusal !== null && <Alert>{refusalLine(state.refusal)}</Alert>}
    </>
  );
}

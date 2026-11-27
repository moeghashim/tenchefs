import { Card, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import { LoginBody } from "./login-body.tsx";
import type { ReactNode } from "react";
import type { Session } from "../../board/index.ts";

const TEXT = { description: "Log in as your human identity. Agents can't log in here.", title: "Log in" } as const;

interface LoginProps {
  readonly session: Session;
}

export function LoginView(props: LoginProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.title}</Heading>
        <Muted>{TEXT.description}</Muted>
      </CardHeader>
      <LoginBody session={props.session} />
    </Card>
  );
}

import { CardBody } from "../../design-system/layout.tsx";
import { LoggedIn } from "./logged-in.tsx";
import type { ReactNode } from "react";
import type { Session } from "../../board/index.ts";
import { Skeleton } from "../../design-system/content.tsx";
import { WebLoginView } from "./web-login.tsx";
import { useSyncExternalStore } from "react";

interface LoginBodyProps {
  readonly session: Session;
}

export function LoginBody(props: LoginBodyProps): ReactNode {
  const { session } = props;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  if (state.status === "checking") {
    return (
      <CardBody>
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "logged-in") {
    return <LoggedIn name={state.identity.name} />;
  }
  return <WebLoginView session={session} state={state} />;
}

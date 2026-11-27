import type { Session, SessionState } from "../../board/index.ts";
import { LoginCards } from "./login-cards.tsx";
import type { ReactNode } from "react";
import { WebLoginExpired } from "./web-login-expired.tsx";
import { WebLoginWaiting } from "./web-login-waiting.tsx";
import { useSyncExternalStore } from "react";

interface WebLoginProps {
  readonly session: Session;
  readonly state: Extract<SessionState, { readonly status: "logged-out" | "logging-in" }>;
}

export function WebLoginView(props: WebLoginProps): ReactNode {
  const { webLogin } = props.session;
  const shown = useSyncExternalStore(webLogin.subscribe, webLogin.snapshot);
  const handleBack = webLogin.back;
  const handleStart = webLogin.start;
  if (shown.status === "waiting") {
    return <WebLoginWaiting onBack={handleBack} waiting={shown} />;
  }
  if (shown.status === "expired") {
    return <WebLoginExpired onBack={handleBack} onStart={handleStart} />;
  }
  return <LoginCards session={props.session} shown={shown} state={props.state} />;
}

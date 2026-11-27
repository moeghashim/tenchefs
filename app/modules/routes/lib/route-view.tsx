import { ApprovalView, Authors, LoginView } from "../../views/index.tsx";
import { AppShell } from "../../design-system/layout.tsx";
import type { Place } from "../../paths/index.ts";
import type { ReactNode } from "react";
import { SignedInView } from "./signed-in-view.tsx";
import type { Stores } from "./stores.ts";
import { usePageTitle } from "../../page-title/index.ts";
import { useSyncExternalStore } from "react";

interface RouteViewProps {
  readonly place: Place;
  readonly stores: Stores;
}

export function RouteView(props: RouteViewProps): ReactNode {
  const {
    place: { profile, route },
    stores: { session },
  } = props;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  usePageTitle({ board: props.stores.boardStore, route });
  if (state.status !== "logged-in") {
    return (
      <AppShell>
        <LoginView session={session} />
      </AppShell>
    );
  }
  if (route.name === "approve") {
    return (
      <AppShell>
        <ApprovalView
          agentJoinApprovals={props.stores.agentJoinApprovals}
          approvalCode={props.stores.approvalCode}
          loginApprovals={props.stores.loginApprovals}
        />
      </AppShell>
    );
  }
  return (
    <Authors boardStore={props.stores.boardStore} keymap={props.stores.keymap}>
      <SignedInView identity={state.identity} profile={profile} route={route} stores={props.stores} />
    </Authors>
  );
}

import { AgentJoinApprovalView, Authors, LoginApprovalView, LoginView, Reacting } from "../../views/index.tsx";
import { AppShell } from "../../design-system/index.tsx";
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
  usePageTitle({ route, session, unread: props.stores.unread });
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
        <LoginApprovalView approval={props.stores.loginApprovals.forCode(route.userCode)} />
      </AppShell>
    );
  }
  if (route.name === "approve-join") {
    return (
      <AppShell>
        <AgentJoinApprovalView approval={props.stores.agentJoinApprovals.forCode(route.userCode)} />
      </AppShell>
    );
  }
  return (
    <Authors boardStore={props.stores.boardStore}>
      <Reacting boardStore={props.stores.boardStore}>
        <SignedInView identity={state.identity} profile={profile} route={route} stores={props.stores} />
      </Reacting>
    </Authors>
  );
}

import type { Identity, IdentityName } from "../../sdk/index.ts";
import { KeyAnnouncements, ScheduleLists, SidebarKeys, SidebarView } from "../../views/index.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { Workspace } from "../../design-system/layout.tsx";
import { WorkspaceBody } from "./workspace-body.tsx";
import { useSyncExternalStore } from "react";

interface SignedInViewProps {
  readonly identity: Identity;
  readonly profile: IdentityName | null;
  readonly route: Route;
  readonly stores: Stores;
}

export function SignedInView(props: SignedInViewProps): ReactNode {
  const { stores } = props;
  const { layout } = stores;
  const { sidebar } = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleToggle = layout.toggleSidebar;
  return (
    <ScheduleLists me={props.identity} scheduleList={stores.scheduleList} scheduling={stores.scheduling}>
      <Workspace onToggleSidebar={handleToggle} sidebarOpen={sidebar}>
        <SidebarView
          creation={stores.channelCreation}
          identity={props.identity}
          keymap={stores.keymap}
          layout={layout}
          route={props.route}
          scheduleList={stores.scheduleList}
          unread={stores.unread}
        />
        <SidebarKeys
          keymap={stores.keymap}
          layout={layout}
          me={props.identity.name}
          scheduleList={stores.scheduleList}
          unread={stores.unread}
        />
        <KeyAnnouncements keymap={stores.keymap} />
        <WorkspaceBody
          me={props.identity.name}
          profile={props.profile}
          route={props.route}
          sidebarOpen={sidebar}
          stores={stores}
        />
      </Workspace>
    </ScheduleLists>
  );
}

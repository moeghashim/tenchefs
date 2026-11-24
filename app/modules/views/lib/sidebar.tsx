import { Sidebar, SidebarBody, SidebarFooter } from "../../design-system/index.tsx";
import type { Board } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import { SidebarLinks } from "./sidebar-links.tsx";
import { SidebarSettings } from "./sidebar-settings.tsx";
import type { Unread } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { sidebarEdge } from "./sidebar-edge.ts";
import { useSyncExternalStore } from "react";

const TEXT = { name: "cookout", sidebar: "Sidebar" } as const;

const HOME = hrefOf({ name: "inbox", selected: null });

interface SidebarProps {
  readonly board: Board;
  readonly identity: Identity;
  readonly layout: Layout;
  readonly route: Route;
  readonly unread: Unread;
}

export function SidebarView(props: SidebarProps): ReactNode {
  const { layout } = props;
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleFollow = layout.closeSidebar;
  const handleToggleCollapsed = layout.toggleCollapsed;
  return (
    <Sidebar
      collapsed={state.collapsed}
      edge={sidebarEdge({ layout, width: state.sidebarWidth })}
      home={HOME}
      label={TEXT.sidebar}
      onFollowHome={handleFollow}
      onToggleCollapsed={handleToggleCollapsed}
      open={state.sidebar}
      title={TEXT.name}
    >
      <SidebarBody onFollow={handleFollow}>
        <SidebarLinks board={props.board} me={props.identity.name} route={props.route} unread={props.unread} />
      </SidebarBody>
      <SidebarFooter>
        <SidebarSettings identity={props.identity} route={props.route} />
      </SidebarFooter>
    </Sidebar>
  );
}

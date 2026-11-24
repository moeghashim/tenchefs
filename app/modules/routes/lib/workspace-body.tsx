import { IdentityDeletedNotice, ReconnectingView, SearchBox } from "../../views/index.tsx";
import { WorkspaceColumn, WorkspaceMain } from "../../design-system/index.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { WorkspacePanes } from "./workspace-panes.tsx";

interface WorkspaceBodyProps {
  readonly me: IdentityName;
  readonly profile: IdentityName | null;
  readonly route: Route;
  readonly stores: Stores;
}

export function WorkspaceBody(props: WorkspaceBodyProps): ReactNode {
  const { stores } = props;
  return (
    <WorkspaceColumn>
      <SearchBox search={stores.search} />
      {stores.live !== null && <ReconnectingView live={stores.live} />}
      <IdentityDeletedNotice identities={stores.composer.identities} />
      <WorkspaceMain>
        <WorkspacePanes me={props.me} profile={props.profile} route={props.route} stores={stores} />
      </WorkspaceMain>
    </WorkspaceColumn>
  );
}

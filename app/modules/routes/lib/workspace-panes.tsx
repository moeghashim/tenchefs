import { ProfileLinks, ProfileView } from "../../views/index.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import { RoutePanes } from "./route-panes.tsx";
import type { Stores } from "./stores.ts";
import { closedHref } from "../../paths/index.ts";

interface WorkspacePanesProps {
  readonly me: IdentityName;
  readonly profile: IdentityName | null;
  readonly route: Route;
  readonly stores: Stores;
}

export function WorkspacePanes(props: WorkspacePanesProps): ReactNode {
  const { me, profile, route, stores } = props;
  return (
    <ProfileLinks route={route}>
      <RoutePanes me={me} route={route} stores={stores} />
      {profile !== null && (
        <ProfileView
          closeHref={closedHref(route)}
          composer={stores.composer}
          key={profile}
          keymap={stores.keymap}
          me={me}
          name={profile}
        />
      )}
    </ProfileLinks>
  );
}

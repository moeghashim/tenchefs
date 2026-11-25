import { PeopleView, ProfileView } from "../../views/index.tsx";
import type { Composer } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";

interface PeoplePanesProps {
  readonly composer: Composer;
  readonly keymap: Keymap;
  readonly layout: Layout;
  readonly me: IdentityName;
  readonly route: Extract<Route, { readonly name: "people" | "profile" }>;
}

function openOf(route: PeoplePanesProps["route"]): IdentityName | null {
  if (route.name === "profile") {
    return route.identity;
  }
  return null;
}

export function PeoplePanes(props: PeoplePanesProps): ReactNode {
  const { composer, route } = props;
  const open = openOf(route);
  return (
    <>
      <PeopleView
        identities={composer.identities}
        keymap={props.keymap}
        layout={props.layout}
        me={props.me}
        open={open}
      />
      {open !== null && (
        <ProfileView
          closeHref={hrefOf({ name: "people" })}
          composer={composer}
          keymap={props.keymap}
          me={props.me}
          name={open}
        />
      )}
    </>
  );
}

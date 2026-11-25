import { InboxView, LoginView, SettingsView } from "../../views/index.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { hrefOf } from "../../paths/index.ts";
import { useThreadEdge } from "./use-thread-edge.ts";

const INBOX = hrefOf({ name: "inbox", selected: null });

interface PagePanesProps {
  readonly me: IdentityName;
  readonly route: Extract<Route, { readonly name: "inbox" | "login" | "settings" }>;
  readonly stores: Stores;
}

export function PagePanes(props: PagePanesProps): ReactNode {
  const { route, stores } = props;
  const edge = useThreadEdge({ closeHref: INBOX, layout: stores.layout });
  if (route.name === "inbox") {
    return (
      <InboxView
        composer={stores.composer}
        edge={edge}
        keymap={stores.keymap}
        me={props.me}
        reading={stores.reading}
        selected={route.selected}
        unread={stores.unread}
      />
    );
  }
  if (route.name === "login") {
    return <LoginView session={stores.session} />;
  }
  return (
    <SettingsView
      composer={stores.composer}
      layout={stores.layout}
      me={props.me}
      section={route.section}
      session={stores.session}
    />
  );
}
